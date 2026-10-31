import { Buffer } from 'node:buffer';
import { createSign, randomUUID } from 'node:crypto';
import { configureApp, parseConfig, ServiceName } from '@dexa/common';
import { ErrorCode, loginResponseSchema, Portal, Role } from '@dexa/contracts';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { createAppModule } from '../src/app.module.js';
import { ApiGatewayConfigSchema } from '../src/config/api-gateway-config.schema.js';
import {
  authEnvironmentFor,
  encodeKeyForEnvironment,
  generateAuthKeySet,
  USER_JWT_AUDIENCE,
  USER_JWT_ISSUER,
  type AuthKeySet,
  userJwtSigningEnvironmentFor,
  userJwtVerifierEnvironmentFor,
} from './auth-key-set.js';
import {
  startAuthServiceProcess,
  UNREACHABLE_BROKER_URL,
  type RunningAuthService,
} from './auth-service-process.js';

// Starting the container and the auth-service process takes several seconds on a cold machine.
const SETUP_TIMEOUT_MS = 180_000;
// Each sign-in and each change runs argon2id inside auth-service.
const TEST_TIMEOUT_MS = 60_000;
const LOGIN_PATH = '/api/v1/auth/login';
const PASSWORD_PATH = '/api/v1/auth/me/password';
const SIGNED_TOKEN_LIFETIME_SECONDS = 300;

const HR_EMAIL = 'hr.admin@dexa.test';
const HR_PASSWORD = 'hr-admin-pass-1';
const NEW_PASSWORD = 'Changed-Pass-2';
const WRONG_CURRENT_PASSWORD = 'Wrong-Pass-9';
const CURRENT_PASSWORD_INCORRECT_MESSAGE = 'The current password is incorrect.';

function encodeJsonSegment(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

// Signs a user token with the test user key. The gateway verifies it, and the account-status check then
// looks the account up in auth-service.
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
    ...userJwtSigningEnvironmentFor(keys),
    USER_JWT_PRIVATE_KEY: encodeKeyForEnvironment(keys.user.privateKeyPem),
    RABBITMQ_URL: UNREACHABLE_BROKER_URL,
    AUTH_DATABASE_URL: databaseUrl,
    AUTH_BOOTSTRAP_HR_EMAIL: HR_EMAIL,
    AUTH_BOOTSTRAP_HR_PASSWORD: HR_PASSWORD,
  };
}

// A fresh account per case, so cases do not depend on each other's passwords.
function uniqueEmail(label: string): string {
  return `${label}.${randomUUID().slice(0, 8)}@dexa.test`;
}

describe('api-gateway self-service password change through a running auth-service', () => {
  let container: StartedPostgreSqlContainer;
  let authService: RunningAuthService;
  let app: INestApplication;
  let keys: AuthKeySet;

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
      ...userJwtVerifierEnvironmentFor(keys),
      AUTH_SERVICE_INTERNAL_URL: authService.baseUrl,
      EMPLOYEE_SERVICE_INTERNAL_URL: 'http://employee-service:3000',
      ATTENDANCE_SERVICE_INTERNAL_URL: 'http://attendance-service:3000',
      NOTIFICATION_SERVICE_INTERNAL_URL: 'http://notification-service:3000',
    });
    const moduleRef = await Test.createTestingModule({
      imports: [createAppModule(config)],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, { CORS_ORIGINS: [] });
    await app.init();
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

  // The new account copies the bootstrap HR password hash, so its password is HR_PASSWORD and this test does
  // not call argon2 itself. Inserts nothing when the bootstrap account is missing, so the sign-in then fails.
  async function insertAccount(email: string, roleCode: Role): Promise<string> {
    const accountId = randomUUID();
    await runSql(
      `insert into accounts (id, company_email, password_hash, role_id, is_active)
       select '${accountId}', '${email}', password_hash,
              (select id from master_roles where code = '${roleCode}'), true
       from accounts where company_email = '${HR_EMAIL}'`,
    );
    return accountId;
  }

  async function signIn(email: string, password: string, portal: Portal): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(LOGIN_PATH)
      .send({ email, password, portal })
      .expect(200);
    return loginResponseSchema.parse(response.body).accessToken;
  }

  function changePassword(accessToken: string, body: Record<string, string>) {
    return request(app.getHttpServer())
      .patch(PASSWORD_PATH)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(body);
  }

  it(
    'should return 204, and then sign in only with the new password, when the current password is correct',
    async () => {
      const email = uniqueEmail('gateway.change');
      await insertAccount(email, Role.EMPLOYEE);
      const accessToken = await signIn(email, HR_PASSWORD, Portal.EMPLOYEE);

      await changePassword(accessToken, {
        currentPassword: HR_PASSWORD,
        newPassword: NEW_PASSWORD,
      }).expect(204);

      await signIn(email, NEW_PASSWORD, Portal.EMPLOYEE);
      await request(app.getHttpServer())
        .post(LOGIN_PATH)
        .send({ email, password: HR_PASSWORD, portal: Portal.EMPLOYEE })
        .expect(401);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 204 for an HR account changing its own password',
    async () => {
      const email = uniqueEmail('gateway.hr');
      await insertAccount(email, Role.HR);
      const accessToken = await signIn(email, HR_PASSWORD, Portal.HR);

      await changePassword(accessToken, {
        currentPassword: HR_PASSWORD,
        newPassword: NEW_PASSWORD,
      }).expect(204);

      await signIn(email, NEW_PASSWORD, Portal.HR);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 400 CURRENT_PASSWORD_INCORRECT with its message when the current password is wrong',
    async () => {
      const email = uniqueEmail('gateway.wrong');
      await insertAccount(email, Role.EMPLOYEE);
      const accessToken = await signIn(email, HR_PASSWORD, Portal.EMPLOYEE);

      const response = await changePassword(accessToken, {
        currentPassword: WRONG_CURRENT_PASSWORD,
        newPassword: NEW_PASSWORD,
      }).expect(400);

      expect(response.body).toEqual({
        statusCode: 400,
        code: ErrorCode.CURRENT_PASSWORD_INCORRECT,
        message: CURRENT_PASSWORD_INCORRECT_MESSAGE,
      });
      await signIn(email, HR_PASSWORD, Portal.EMPLOYEE);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 UNAUTHORIZED without calling auth-service when no bearer token is sent',
    async () => {
      const response = await request(app.getHttpServer())
        .patch(PASSWORD_PATH)
        .send({ currentPassword: HR_PASSWORD, newPassword: NEW_PASSWORD })
        .expect(401);

      expect(response.body).toMatchObject({ code: ErrorCode.UNAUTHORIZED });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 ACCOUNT_DISABLED when the signed token belongs to a deactivated account',
    async () => {
      const email = uniqueEmail('gateway.disabled');
      const accountId = randomUUID();
      await runSql(
        `insert into accounts (id, company_email, password_hash, role_id, is_active)
         select '${accountId}', '${email}', password_hash,
                (select id from master_roles where code = 'EMPLOYEE'), false
         from accounts where company_email = '${HR_EMAIL}'`,
      );
      const accessToken = signUserTokenForAccount(keys, accountId, Role.EMPLOYEE);

      const response = await changePassword(accessToken, {
        currentPassword: HR_PASSWORD,
        newPassword: NEW_PASSWORD,
      }).expect(401);

      expect(response.body).toMatchObject({ code: ErrorCode.ACCOUNT_DISABLED });
    },
    TEST_TIMEOUT_MS,
  );
});
