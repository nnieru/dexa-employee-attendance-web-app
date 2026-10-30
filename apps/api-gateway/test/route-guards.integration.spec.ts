import { Buffer } from 'node:buffer';
import { createSign, randomUUID } from 'node:crypto';
import {
  configureApp,
  parseConfig,
  Roles,
  ServiceName,
  type InternalBinaryResponse,
} from '@dexa/common';
import {
  loginResponseSchema,
  MAX_PHOTO_BYTES,
  PHOTO_CONTENT_TYPE,
  Portal,
  Role,
  type MasterOption,
  type OwnProfile,
  type UpdateOwnProfileRequest,
} from '@dexa/contracts';
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { createAppModule } from '../src/app.module.js';
import {
  EMPLOYEE_SERVICE_CLIENT,
  type IEmployeeServiceClient,
} from '../src/employees/employee-service-client.interface.js';
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
const POSITIONS_PATH = '/api/v1/positions';
const EMPLOYEE_STATUSES_PATH = '/api/v1/employee-statuses';
const OWN_PROFILE_PATH = '/api/v1/employees/me';
const OWN_PHOTO_PATH = '/api/v1/employees/me/photo';
const PHOTO_MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const STORED_PHOTO_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
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

// Stands in for employee-service, so these tests cover the gateway's own checks without starting it.
// Each call records the token it was given, so a test can show the gateway forwarded the caller's token.
const POSITIONS: MasterOption[] = [
  { id: randomUUID(), code: 'DATA_ANALYST', name: 'Data Analyst', isActive: false },
  { id: randomUUID(), code: 'HR_OFFICER', name: 'HR Officer', isActive: true },
];
const EMPLOYEE_STATUSES: MasterOption[] = [
  { id: randomUUID(), code: 'ACTIVE', name: 'Active', isActive: true },
];
const OWN_PROFILE: OwnProfile = {
  accountId: randomUUID(),
  name: 'Nadia Rahma',
  email: 'nadia.rahma@dexa.test',
  position: { code: 'FULLSTACK_DEVELOPER', name: 'Fullstack Developer' },
  phoneNumber: null,
  photoUrl: null,
  profileStatus: 'INCOMPLETE',
};
const forwardedTokens: string[] = [];
const profileUpdates: UpdateOwnProfileRequest[] = [];
const photoUploads: Buffer[] = [];
const OWN_PHOTO_FILE: InternalBinaryResponse = {
  contentType: PHOTO_CONTENT_TYPE,
  body: STORED_PHOTO_BYTES,
};
const employeeServiceFake: IEmployeeServiceClient = {
  updateOwnPhoto: (accessToken: string, photo: Buffer) => {
    forwardedTokens.push(accessToken);
    photoUploads.push(photo);
    return Promise.resolve(OWN_PROFILE);
  },
  getOwnPhoto: (accessToken: string) => {
    forwardedTokens.push(accessToken);
    return Promise.resolve(OWN_PHOTO_FILE);
  },
  getOwnProfile: (accessToken: string) => {
    forwardedTokens.push(accessToken);
    return Promise.resolve(OWN_PROFILE);
  },
  updateOwnProfile: (accessToken: string, request: UpdateOwnProfileRequest) => {
    forwardedTokens.push(accessToken);
    profileUpdates.push(request);
    return Promise.resolve({ ...OWN_PROFILE, phoneNumber: request.phoneNumber });
  },
  listPositions: (accessToken: string) => {
    forwardedTokens.push(accessToken);
    return Promise.resolve(POSITIONS);
  },
  listEmployeeStatuses: (accessToken: string) => {
    forwardedTokens.push(accessToken);
    return Promise.resolve(EMPLOYEE_STATUSES);
  },
};

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
      EMPLOYEE_SERVICE_INTERNAL_URL: 'http://employee-service:3000',
    });
    const moduleRef = await Test.createTestingModule({
      imports: [createAppModule(config)],
      controllers: [StubHrController, StubSelfServiceController],
    })
      .overrideProvider(EMPLOYEE_SERVICE_CLIENT)
      .useValue(employeeServiceFake)
      .compile();
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

  function patchWithToken(path: string, accessToken: string, body: unknown) {
    return request(app.getHttpServer())
      .patch(path)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(body as object);
  }

  function putPhotoWithToken(accessToken: string, bytes: Buffer) {
    return request(app.getHttpServer())
      .put(OWN_PHOTO_PATH)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('photo', bytes, { filename: 'photo.png', contentType: 'image/png' });
  }

  // The photo answer is bytes, so the body is collected rather than parsed.
  function getPhotoWithToken(accessToken: string) {
    return request(app.getHttpServer())
      .get(OWN_PHOTO_PATH)
      .set('Authorization', `Bearer ${accessToken}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('error', (error: Error) => callback(error, Buffer.alloc(0)));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });
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

  it.each([POSITIONS_PATH, EMPLOYEE_STATUSES_PATH])(
    'should return 401 UNAUTHORIZED on %s when no bearer token is sent, without calling employee-service',
    async (path) => {
      forwardedTokens.length = 0;

      const response = await request(app.getHttpServer()).get(path).expect(401);

      expect(response.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
      expect(forwardedTokens).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it.each([POSITIONS_PATH, EMPLOYEE_STATUSES_PATH])(
    'should return 403 FORBIDDEN on %s when an employee token is sent, without calling employee-service',
    async (path) => {
      forwardedTokens.length = 0;

      const response = await getWithToken(path, employeeToken).expect(403);

      expect(response.body).toEqual({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Your role cannot use this action.',
      });
      expect(forwardedTokens).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return the positions and forward the HR token when an HR token calls the positions route',
    async () => {
      forwardedTokens.length = 0;

      const response = await getWithToken(POSITIONS_PATH, hrToken).expect(200);

      expect(response.body).toEqual(POSITIONS);
      expect(forwardedTokens).toEqual([hrToken]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return the employee statuses and forward the HR token when an HR token calls the statuses route',
    async () => {
      forwardedTokens.length = 0;

      const response = await getWithToken(EMPLOYEE_STATUSES_PATH, hrToken).expect(200);

      expect(response.body).toEqual(EMPLOYEE_STATUSES);
      expect(forwardedTokens).toEqual([hrToken]);
    },
    TEST_TIMEOUT_MS,
  );

  it.each([
    { caller: 'an employee', token: () => employeeToken },
    { caller: 'an HR account', token: () => hrToken },
  ])(
    'should return the own profile and forward the caller token when $caller calls the own profile route',
    async ({ token }) => {
      forwardedTokens.length = 0;

      const response = await getWithToken(OWN_PROFILE_PATH, token()).expect(200);

      expect(response.body).toEqual(OWN_PROFILE);
      expect(forwardedTokens).toEqual([token()]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 UNAUTHORIZED on the own profile route when no bearer token is sent, without calling employee-service',
    async () => {
      forwardedTokens.length = 0;

      const response = await request(app.getHttpServer()).get(OWN_PROFILE_PATH).expect(401);

      expect(response.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
      expect(forwardedTokens).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it.each([
    { caller: 'an employee', token: () => employeeToken },
    { caller: 'an HR account', token: () => hrToken },
  ])(
    'should return the updated profile and forward the caller token when $caller updates the phone number',
    async ({ token }) => {
      forwardedTokens.length = 0;
      profileUpdates.length = 0;

      const response = await patchWithToken(OWN_PROFILE_PATH, token(), {
        phoneNumber: '  +6281234567890  ',
      }).expect(200);

      expect(response.body).toEqual({ ...OWN_PROFILE, phoneNumber: '+6281234567890' });
      expect(profileUpdates).toEqual([{ phoneNumber: '+6281234567890' }]);
      expect(forwardedTokens).toEqual([token()]);
    },
    TEST_TIMEOUT_MS,
  );

  it.each([
    { condition: 'the name is sent', body: { phoneNumber: '+6281234567890', name: 'Changed' } },
    {
      condition: 'the email is sent',
      body: { phoneNumber: '+6281234567890', email: 'changed@dexa.test' },
    },
    {
      condition: 'the position is sent',
      body: { phoneNumber: '+6281234567890', positionId: randomUUID() },
    },
    {
      condition: 'the profile status is sent',
      body: { phoneNumber: '+6281234567890', profileStatus: 'COMPLETE' },
    },
    { condition: 'the phone number is not a phone number', body: { phoneNumber: 'call me' } },
  ])(
    'should return 400 VALIDATION_FAILED without calling employee-service when $condition',
    async ({ body }) => {
      forwardedTokens.length = 0;
      profileUpdates.length = 0;

      const response = await patchWithToken(OWN_PROFILE_PATH, employeeToken, body).expect(400);

      expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
      expect(forwardedTokens).toEqual([]);
      expect(profileUpdates).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 UNAUTHORIZED on the phone update route when no bearer token is sent, without calling employee-service',
    async () => {
      forwardedTokens.length = 0;

      const response = await request(app.getHttpServer())
        .patch(OWN_PROFILE_PATH)
        .send({ phoneNumber: '+6281234567890' })
        .expect(401);

      expect(response.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
      expect(forwardedTokens).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should store the uploaded bytes and forward the employee token when the employee uploads a photo',
    async () => {
      forwardedTokens.length = 0;
      photoUploads.length = 0;
      const upload = Buffer.from('uploaded photo bytes');

      const response = await putPhotoWithToken(employeeToken, upload).expect(200);

      expect(response.body).toEqual(OWN_PROFILE);
      expect(forwardedTokens).toEqual([employeeToken]);
      expect(photoUploads).toHaveLength(1);
      expect(photoUploads[0]?.equals(upload)).toBe(true);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 413 PHOTO_TOO_LARGE without calling employee-service when the declared length is over the limit',
    async () => {
      forwardedTokens.length = 0;
      photoUploads.length = 0;
      const oversized = Buffer.alloc(MAX_PHOTO_BYTES + PHOTO_MULTIPART_OVERHEAD_BYTES + 1, 0x61);

      const response = await putPhotoWithToken(employeeToken, oversized).expect(413);

      expect(response.body).toMatchObject({ statusCode: 413, code: 'PHOTO_TOO_LARGE' });
      expect(forwardedTokens).toEqual([]);
      expect(photoUploads).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 UNAUTHORIZED on the photo upload route when no bearer token is sent, without calling employee-service',
    async () => {
      forwardedTokens.length = 0;
      photoUploads.length = 0;

      const response = await request(app.getHttpServer())
        .put(OWN_PHOTO_PATH)
        .attach('photo', Buffer.from('uploaded photo bytes'), 'photo.png')
        .expect(401);

      expect(response.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
      expect(forwardedTokens).toEqual([]);
      expect(photoUploads).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return the stored bytes with the private photo headers and forward the employee token when the employee fetches the photo',
    async () => {
      forwardedTokens.length = 0;

      const response = await getPhotoWithToken(employeeToken).expect(200);

      expect(response.headers['content-type']).toBe(PHOTO_CONTENT_TYPE);
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      const body: unknown = response.body;
      expect(Buffer.isBuffer(body) && body.equals(STORED_PHOTO_BYTES)).toBe(true);
      expect(forwardedTokens).toEqual([employeeToken]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 UNAUTHORIZED on the photo fetch route when no bearer token is sent, without calling employee-service',
    async () => {
      forwardedTokens.length = 0;

      const response = await request(app.getHttpServer()).get(OWN_PHOTO_PATH).expect(401);

      expect(response.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
      expect(forwardedTokens).toEqual([]);
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
