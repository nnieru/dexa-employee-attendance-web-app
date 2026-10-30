import { configureApp, parseConfig, ServiceName } from '@dexa/common';
import type { INestApplication, LoggerService } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { createAppModule } from '../src/app.module.js';
import { ApiGatewayConfigSchema } from '../src/config/api-gateway-config.schema.js';
import {
  authEnvironmentFor,
  encodeKeyForEnvironment,
  generateAuthKeySet,
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
const ARGON2ID_PREFIX = '$argon2id$';

const HR_EMAIL = 'hr.admin@dexa.test';
const HR_PASSWORD = 'hr-admin-pass-1';
const UNKNOWN_EMAIL = 'nobody@dexa.test';
const WRONG_PASSWORD = 'wrong-pass-9';

const GENERIC_REFUSAL_BODY = {
  statusCode: 401,
  code: 'INVALID_CREDENTIALS',
  message: 'Invalid email or password.',
};

// Records what the gateway logs, so the test can check that no password reaches a log.
function recordingLogger(messages: string[]): LoggerService {
  const record = (message: unknown): void => {
    messages.push(String(message));
  };
  return { log: record, warn: record, error: record, debug: record, verbose: record };
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

describe('api-gateway sign-in through a running auth-service', () => {
  let container: StartedPostgreSqlContainer;
  let authService: RunningAuthService;
  let app: INestApplication;
  let gatewayLogs: string[];

  beforeAll(async () => {
    const keys = generateAuthKeySet();
    container = await new PostgreSqlContainer('postgres:18').start();
    authService = await startAuthServiceProcess(
      authServiceProcessEnvironment(keys, container.getConnectionUri()),
    );
    const config = parseConfig(ApiGatewayConfigSchema, {
      BUSINESS_TIMEZONE: 'Asia/Jakarta',
      ...authEnvironmentFor(keys, ServiceName.API_GATEWAY),
      AUTH_SERVICE_INTERNAL_URL: authService.baseUrl,
    });
    gatewayLogs = [];
    const moduleRef = await Test.createTestingModule({ imports: [createAppModule(config)] })
      .setLogger(recordingLogger(gatewayLogs))
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app, { CORS_ORIGINS: [] });
    await app.init();
  }, SETUP_TIMEOUT_MS);

  // Teardown still stops each resource when setup failed partway through.
  afterAll(async () => {
    await app?.close();
    await authService?.stop();
    await container?.stop();
  }, SETUP_TIMEOUT_MS);

  function login(email: string, password: string) {
    return request(app.getHttpServer()).post(LOGIN_PATH).send({ email, password, portal: 'HR' });
  }

  it(
    'should return 200 with a bearer token and the account when the HR credentials are valid',
    async () => {
      const response = await login(HR_EMAIL, HR_PASSWORD).expect(200);

      expect(response.body).toEqual({
        accessToken: expect.any(String),
        tokenType: 'Bearer',
        expiresIn: 3600,
        account: { id: expect.any(String), email: HR_EMAIL, role: 'HR' },
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return the signed-in account from /auth/me when the gateway forwards the user token',
    async () => {
      const session = (await login(HR_EMAIL, HR_PASSWORD).expect(200)).body;

      const response = await request(app.getHttpServer())
        .get(CURRENT_ACCOUNT_PATH)
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(200);

      expect(response.body).toEqual(session.account);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return the generic 401 when the password is wrong',
    async () => {
      const response = await login(HR_EMAIL, WRONG_PASSWORD).expect(401);

      expect(response.body).toEqual(GENERIC_REFUSAL_BODY);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return the same 401 body when the email is unknown',
    async () => {
      const wrongPassword = await login(HR_EMAIL, WRONG_PASSWORD).expect(401);
      const unknownEmail = await login(UNKNOWN_EMAIL, WRONG_PASSWORD).expect(401);

      expect(unknownEmail.text).toBe(wrongPassword.text);
    },
    TEST_TIMEOUT_MS,
  );

  it('should return 400 VALIDATION_FAILED when the body has no portal', async () => {
    const response = await request(app.getHttpServer())
      .post(LOGIN_PATH)
      .send({ email: HR_EMAIL, password: HR_PASSWORD })
      .expect(400);

    expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
  });

  it('should return 401 UNAUTHORIZED when /auth/me has no bearer token', async () => {
    const response = await request(app.getHttpServer()).get(CURRENT_ACCOUNT_PATH).expect(401);

    expect(response.body).toEqual({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Sign in to continue.',
    });
  });

  it(
    'should return 401 UNAUTHORIZED when auth-service refuses the bearer token',
    async () => {
      const response = await request(app.getHttpServer())
        .get(CURRENT_ACCOUNT_PATH)
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
    'should keep the password and its hash out of responses and of both services logs',
    async () => {
      gatewayLogs.length = 0;
      const success = await login(HR_EMAIL, HR_PASSWORD).expect(200);
      const refusal = await login(HR_EMAIL, WRONG_PASSWORD).expect(401);

      const exposed = [
        success.text,
        refusal.text,
        gatewayLogs.join('\n'),
        authService.readOutput(),
      ].join('\n');
      expect(exposed).not.toContain(HR_PASSWORD);
      expect(exposed).not.toContain(WRONG_PASSWORD);
      expect(exposed).not.toContain(ARGON2ID_PREFIX);
    },
    TEST_TIMEOUT_MS,
  );
});
