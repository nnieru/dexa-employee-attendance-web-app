import { Buffer } from 'node:buffer';
import { createSign, randomUUID } from 'node:crypto';
import { configureApp, parseConfig, ServiceName } from '@dexa/common';
import { loginResponseSchema, Portal, Role } from '@dexa/contracts';
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { createAppModule } from '../src/app.module.js';
import { Roles } from '../src/auth/roles.decorator.js';
import { ApiGatewayConfigSchema } from '../src/config/api-gateway-config.schema.js';
import {
  authEnvironmentFor,
  encodeKeyForEnvironment,
  generateAuthKeySet,
  USER_JWT_AUDIENCE,
  USER_JWT_ISSUER,
  type AuthKeySet,
} from './auth-key-set.js';
import {
  startAuthServiceProcess,
  UNREACHABLE_BROKER_URL,
  type RunningAuthService,
} from './auth-service-process.js';

// Starting the container and the auth-service process takes several seconds on a cold machine.
const SETUP_TIMEOUT_MS = 180_000;
// Each sign-in runs one argon2id verification in auth-service.
const TEST_TIMEOUT_MS = 60_000;
const LOGIN_PATH = '/api/v1/auth/login';
const CURRENT_ACCOUNT_PATH = '/api/v1/auth/me';
const HEALTH_PATH = '/api/v1/health';
const HR_ROUTE_PATH = '/api/v1/route-guard-tests/hr';
const SELF_SERVICE_ROUTE_PATH = '/api/v1/route-guard-tests/self-service';
const SIGNED_TOKEN_LIFETIME_SECONDS = 300;

const HR_EMAIL = 'hr.admin@dexa.test';
const HR_PASSWORD = 'hr-admin-pass-1';
const EMPLOYEE_EMAIL = 'employee.one@dexa.test';
const EMPLOYEE_ACCOUNT_ID = randomUUID();
const DEACTIVATED_EMAIL = 'employee.two@dexa.test';

const ACCOUNT_DISABLED_BODY = {
  statusCode: 401,
  code: 'ACCOUNT_DISABLED',
  message: 'This account is no longer active.',
};

@Controller('route-guard-tests/hr')
class StubHrController {
  @Roles(Role.HR)
  @Get()
  getHrRoute(): { route: string } {
    return { route: 'hr' };
  }
}

@Controller('route-guard-tests/self-service')
class StubSelfServiceController {
  @Roles(Role.EMPLOYEE, Role.HR)
  @Get()
  getSelfServiceRoute(): { route: string } {
    return { route: 'self-service' };
  }
}

function encodeJsonSegment(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

// Signs a user token with the test user key, which only auth-service holds in production. The gateway
// verifies the signature, so a token for an account that does not exist reaches the account lookup.
function signUserTokenForAccount(keys: AuthKeySet, accountId: string, role: Role): string {
  const signingInput = [
    encodeJsonSegment({ alg: 'RS256', typ: 'JWT' }),
    encodeJsonSegment({
      sub: accountId,
      role,
      iss: USER_JWT_ISSUER,
      aud: USER_JWT_AUDIENCE,
      exp: Math.floor(Date.now() / 1000) + SIGNED_TOKEN_LIFETIME_SECONDS,
    }),
  ].join('.');
  const signature = createSign('RSA-SHA256')
    .update(signingInput)
    .sign(keys.user.privateKeyPem, 'base64url');
  return `${signingInput}.${signature}`;
}

// The environment that auth-service starts with. It holds the user private key, which only it may hold.
function authServiceProcessEnvironment(
  keys: AuthKeySet,
  databaseUrl: string,
): Record<string, string> {
  return {
    NODE_ENV: 'test',
    BUSINESS_TIMEZONE: 'Asia/Jakarta',
    ...authEnvironmentFor(keys, ServiceName.AUTH_SERVICE),
    USER_JWT_PRIVATE_KEY: encodeKeyForEnvironment(keys.user.privateKeyPem),
    RABBITMQ_URL: UNREACHABLE_BROKER_URL,
    AUTH_DATABASE_URL: databaseUrl,
    AUTH_BOOTSTRAP_HR_EMAIL: HR_EMAIL,
    AUTH_BOOTSTRAP_HR_PASSWORD: HR_PASSWORD,
  };
}

describe('api-gateway route guards through a running auth-service', () => {
  let container: StartedPostgreSqlContainer;
  let authService: RunningAuthService;
  let app: INestApplication;
  let keys: AuthKeySet;
  let hrToken: string;
  let employeeToken: string;

  // Teardown still stops each resource when setup failed partway through.
  afterAll(async () => {
    await app?.close();
    await authService?.stop();
    await container?.stop();
  }, SETUP_TIMEOUT_MS);

  beforeAll(async () => {
    keys = generateAuthKeySet();
    container = await new PostgreSqlContainer('postgres:18').start();
    authService = await startAuthServiceProcess(
      authServiceProcessEnvironment(keys, container.getConnectionUri()),
    );
    const config = parseConfig(ApiGatewayConfigSchema, {
      BUSINESS_TIMEZONE: 'Asia/Jakarta',
      ...authEnvironmentFor(keys, ServiceName.API_GATEWAY),
      AUTH_SERVICE_INTERNAL_URL: authService.baseUrl,
    });
    const moduleRef = await Test.createTestingModule({
      imports: [createAppModule(config)],
      controllers: [StubHrController, StubSelfServiceController],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, { CORS_ORIGINS: [] });
    await app.init();

    // The employee copies the bootstrap HR password hash, so it can sign in through the gateway without
    // this test calling argon2 directly.
    await insertEmployeeAccount(EMPLOYEE_ACCOUNT_ID, EMPLOYEE_EMAIL);
    hrToken = await signIn(HR_EMAIL, HR_PASSWORD, Portal.HR);
    employeeToken = await signIn(EMPLOYEE_EMAIL, HR_PASSWORD, Portal.EMPLOYEE);
  }, SETUP_TIMEOUT_MS);

  async function runSql(statement: string): Promise<void> {
    const result = await container.exec([
      'psql',
      '-X',
      '-q',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      container.getUsername(),
      '-d',
      container.getDatabase(),
      '-c',
      statement,
    ]);
    if (result.exitCode !== 0) {
      throw new Error(`psql failed with exit code ${result.exitCode}: ${result.output}`);
    }
  }

  // Inserts nothing when the bootstrap HR account is missing, so the sign-in that follows fails loudly.
  async function insertEmployeeAccount(accountId: string, email: string): Promise<void> {
    await runSql(
      `insert into accounts (id, company_email, password_hash, role_id, is_active)
       select '${accountId}', '${email}', password_hash,
              (select id from master_roles where code = 'EMPLOYEE'), true
       from accounts where company_email = '${HR_EMAIL}'`,
    );
  }

  async function signIn(email: string, password: string, portal: Portal): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(LOGIN_PATH)
      .send({ email, password, portal })
      .expect(200);
    return loginResponseSchema.parse(response.body).accessToken;
  }

  function getWithToken(path: string, accessToken: string) {
    return request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${accessToken}`);
  }

  it(
    'should return 401 UNAUTHORIZED on the HR route when no bearer token is sent',
    async () => {
      const response = await request(app.getHttpServer()).get(HR_ROUTE_PATH).expect(401);

      expect(response.body).toEqual({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Sign in to continue.',
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 UNAUTHORIZED on the HR route when the bearer token is not a user token',
    async () => {
      const response = await request(app.getHttpServer())
        .get(HR_ROUTE_PATH)
        .set('Authorization', 'Bearer not-a-user-token')
        .expect(401);

      expect(response.body).toEqual({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Unauthorized',
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 403 FORBIDDEN when an employee token calls the HR route',
    async () => {
      const response = await getWithToken(HR_ROUTE_PATH, employeeToken).expect(403);

      expect(response.body).toEqual({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Your role cannot use this action.',
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 200 when an employee token calls the self-service route',
    async () => {
      const response = await getWithToken(SELF_SERVICE_ROUTE_PATH, employeeToken).expect(200);

      expect(response.body).toEqual({ route: 'self-service' });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 200 when an HR token calls the HR route and the self-service route',
    async () => {
      await getWithToken(HR_ROUTE_PATH, hrToken).expect(200);
      const response = await getWithToken(SELF_SERVICE_ROUTE_PATH, hrToken).expect(200);

      expect(response.body).toEqual({ route: 'self-service' });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return the employee account from /auth/me when the employee token is valid',
    async () => {
      const response = await getWithToken(CURRENT_ACCOUNT_PATH, employeeToken).expect(200);

      expect(response.body).toEqual({
        id: EMPLOYEE_ACCOUNT_ID,
        email: EMPLOYEE_EMAIL,
        role: Role.EMPLOYEE,
      });
    },
    TEST_TIMEOUT_MS,
  );

  it('should return 200 from the health route without a token', async () => {
    const response = await request(app.getHttpServer()).get(HEALTH_PATH).expect(200);

    expect(response.body).toEqual({ status: 'ok' });
  });

  it(
    'should return a bearer token from login when no token is sent',
    async () => {
      const response = await request(app.getHttpServer())
        .post(LOGIN_PATH)
        .send({ email: HR_EMAIL, password: HR_PASSWORD, portal: Portal.HR })
        .expect(200);

      expect(response.body).toMatchObject({ tokenType: 'Bearer', account: { role: Role.HR } });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 ACCOUNT_DISABLED on the next request after the account is deactivated',
    async () => {
      const accountId = randomUUID();
      await insertEmployeeAccount(accountId, DEACTIVATED_EMAIL);
      const token = await signIn(DEACTIVATED_EMAIL, HR_PASSWORD, Portal.EMPLOYEE);
      await getWithToken(SELF_SERVICE_ROUTE_PATH, token).expect(200);

      await runSql(`update accounts set is_active = false where id = '${accountId}'`);
      const response = await getWithToken(SELF_SERVICE_ROUTE_PATH, token).expect(401);

      expect(response.body).toEqual(ACCOUNT_DISABLED_BODY);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 UNAUTHORIZED when the token names an account that does not exist',
    async () => {
      const token = signUserTokenForAccount(keys, randomUUID(), Role.EMPLOYEE);

      const response = await getWithToken(SELF_SERVICE_ROUTE_PATH, token).expect(401);

      expect(response.body).toEqual({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Sign in to continue.',
      });
    },
    TEST_TIMEOUT_MS,
  );
});
