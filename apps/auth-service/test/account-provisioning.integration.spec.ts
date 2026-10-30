import { ServiceName, configureApp, parseConfig } from '@dexa/common';
import type { Database } from '@dexa/db';
import type { INestApplication, LoggerService } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createAppModule } from '../src/app.module.js';
import { AuthServiceConfigSchema } from '../src/config/auth-service-config.schema.js';
import {
  PASSWORD_HASHER,
  type IPasswordHasher,
} from '../src/credentials/password-hasher.interface.js';
import { DATABASE } from '../src/infrastructure/db/database.token.js';
import { accounts, masterRoles } from '../src/infrastructure/db/schema.js';
import {
  authServiceEnvironment,
  generateAuthKeySet,
  servicePair,
  type AuthKeySet,
} from './auth-key-set.js';

// Starting the container pulls an image on a cold machine, which exceeds Jest's 5 second default.
const CONTAINER_TIMEOUT_MS = 120_000;
// Each create and sign-in runs argon2id, which takes a noticeable fraction of a second.
const TEST_TIMEOUT_MS = 60_000;
const PROVISIONING_PATH = '/api/v1/internal/account-provisioning-operations';
const SESSIONS_PATH = '/api/v1/internal/sessions';
const LOOKUP_PATH = '/api/v1/internal/accounts/lookup';
const SERVICE_TOKEN_LIFETIME_SECONDS = 60;
const ARGON2ID_PREFIX = '$argon2id$';

const HR_EMAIL = 'hr.admin@dexa.test';
const HR_PASSWORD = 'hr-admin-pass-1';
const EMPLOYEE_EMAIL = 'nadia.rahma@dexa.test';
const EMPLOYEE_PASSWORD = 'employee-pass-1';
const INITIAL_PASSWORD = 'new-hire-pass-1';

const GENERIC_REFUSAL_BODY = {
  statusCode: 401,
  code: 'INVALID_CREDENTIALS',
  message: 'Invalid email or password.',
};
const UNAUTHORIZED_BODY = { statusCode: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' };
const EMAIL_IN_USE_MESSAGE = 'An account already uses this company email.';

const jwtService = new JwtService();
// Generated once for the file. The keys are only as valid as the config needs.
const TEST_KEYS: AuthKeySet = generateAuthKeySet();

type ProvisioningBody = {
  readonly operationId: string;
  readonly actorAccountId: string;
  readonly email: string;
  readonly role: string;
  readonly initialPassword: string;
};

// Signs a service token the way a calling service does: the caller's key, its own name as kid and
// issuer, and the target as audience.
function signServiceToken(caller: ServiceName, target: ServiceName): Promise<string> {
  return jwtService.signAsync(
    {},
    {
      privateKey: servicePair(TEST_KEYS, caller).privateKeyPem,
      algorithm: 'ES256',
      keyid: caller,
      issuer: caller,
      subject: caller,
      audience: target,
      expiresIn: SERVICE_TOKEN_LIFETIME_SECONDS,
    },
  );
}

// Records what the modules log, so the test can check that no password or hash reaches a log.
function recordingLogger(messages: string[]): LoggerService {
  const record = (message: unknown): void => {
    messages.push(String(message));
  };
  return { log: record, warn: record, error: record, debug: record, verbose: record };
}

function requireRow<TRow>(row: TRow | undefined): TRow {
  if (row === undefined) throw new Error('Expected a row, but the query returned none.');
  return row;
}

// A fresh email per case, so cases do not depend on each other's accounts.
function uniqueEmail(label: string): string {
  return `${label}.${randomUUID().slice(0, 8)}@dexa.test`;
}

describe('account provisioning', () => {
  let container: StartedPostgreSqlContainer;
  let moduleRef: TestingModule;
  let app: INestApplication;
  let database: Database;
  let hasher: IPasswordHasher;
  let loggedMessages: string[];
  let gatewayToken: string;
  let employeeServiceToken: string;
  let hrAccountId: string;
  let employeeAccountId: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18').start();
    const config = parseConfig(
      AuthServiceConfigSchema,
      authServiceEnvironment(TEST_KEYS, {
        AUTH_DATABASE_URL: container.getConnectionUri(),
        AUTH_BOOTSTRAP_HR_EMAIL: HR_EMAIL,
        AUTH_BOOTSTRAP_HR_PASSWORD: HR_PASSWORD,
      }),
    );
    loggedMessages = [];
    moduleRef = await Test.createTestingModule({ imports: [createAppModule(config)] })
      .setLogger(recordingLogger(loggedMessages))
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app, { CORS_ORIGINS: [] });
    await app.init();

    database = moduleRef.get<Database>(DATABASE);
    hasher = moduleRef.get<IPasswordHasher>(PASSWORD_HASHER);
    hrAccountId = await findAccountIdByEmail(HR_EMAIL);
    employeeAccountId = await insertAccount({
      email: EMPLOYEE_EMAIL,
      password: EMPLOYEE_PASSWORD,
      roleCode: 'EMPLOYEE',
    });
    gatewayToken = await signServiceToken(ServiceName.API_GATEWAY, ServiceName.AUTH_SERVICE);
    employeeServiceToken = await signServiceToken(
      ServiceName.EMPLOYEE_SERVICE,
      ServiceName.AUTH_SERVICE,
    );
  }, CONTAINER_TIMEOUT_MS);

  // Teardown still stops the container when setup failed partway through.
  afterAll(async () => {
    await app?.close();
    await container?.stop();
  }, CONTAINER_TIMEOUT_MS);

  async function findAccountIdByEmail(companyEmail: string): Promise<string> {
    const rows = await database.db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.companyEmail, companyEmail));
    return requireRow(rows[0]).id;
  }

  async function countAccountsWithEmail(companyEmail: string): Promise<number> {
    const rows = await database.db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.companyEmail, companyEmail));
    return rows.length;
  }

  async function insertAccount(options: {
    readonly email: string;
    readonly password: string;
    readonly roleCode: string;
  }): Promise<string> {
    const roleRows = await database.db
      .select({ id: masterRoles.id })
      .from(masterRoles)
      .where(eq(masterRoles.code, options.roleCode));
    const rows = await database.db
      .insert(accounts)
      .values({
        companyEmail: options.email,
        passwordHash: await hasher.hash(options.password),
        roleId: requireRow(roleRows[0]).id,
        isActive: true,
      })
      .returning({ id: accounts.id });
    return requireRow(rows[0]).id;
  }

  function defaultBody(overrides: Partial<ProvisioningBody> = {}): ProvisioningBody {
    return {
      operationId: randomUUID(),
      actorAccountId: hrAccountId,
      email: uniqueEmail('new.hire'),
      role: 'EMPLOYEE',
      initialPassword: INITIAL_PASSWORD,
      ...overrides,
    };
  }

  function postProvisioning(body: unknown, token: string = employeeServiceToken) {
    return request(app.getHttpServer())
      .post(PROVISIONING_PATH)
      .set('Authorization', `Bearer ${token}`)
      .send(body as object);
  }

  function postActivation(operationId: string) {
    return request(app.getHttpServer())
      .post(`${PROVISIONING_PATH}/${operationId}/activation`)
      .set('Authorization', `Bearer ${employeeServiceToken}`);
  }

  function getOperation(operationId: string) {
    return request(app.getHttpServer())
      .get(`${PROVISIONING_PATH}/${operationId}`)
      .set('Authorization', `Bearer ${employeeServiceToken}`);
  }

  function signIn(email: string, password: string, portal: string) {
    return request(app.getHttpServer())
      .post(SESSIONS_PATH)
      .set('Authorization', `Bearer ${gatewayToken}`)
      .send({ email, password, portal });
  }

  describe('POST /api/v1/internal/account-provisioning-operations', () => {
    it(
      'should return 200 with a PENDING operation and one new account when the request is valid',
      async () => {
        const body = defaultBody();

        const response = await postProvisioning(body).expect(200);

        expect(response.body).toEqual({
          operationId: body.operationId,
          accountId: expect.any(String),
          status: 'PENDING',
        });
        expect(await countAccountsWithEmail(body.email)).toBe(1);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return the same account when the same operation ID is retried with the same request',
      async () => {
        const body = defaultBody();
        const first = await postProvisioning(body).expect(200);

        const retry = await postProvisioning(body).expect(200);

        expect(retry.body).toEqual(first.body);
        expect(await countAccountsWithEmail(body.email)).toBe(1);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 409 when the same operation ID is retried with a different email',
      async () => {
        const body = defaultBody();
        await postProvisioning(body).expect(200);

        const response = await postProvisioning({ ...body, email: uniqueEmail('other') }).expect(
          409,
        );

        expect(response.body).toMatchObject({ statusCode: 409, code: 'CONFLICT' });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 409 when the same operation ID is retried with a different password',
      async () => {
        const body = defaultBody();
        await postProvisioning(body).expect(200);

        const response = await postProvisioning({
          ...body,
          initialPassword: 'other-pass-22',
        }).expect(409);

        expect(response.body).toMatchObject({ statusCode: 409, code: 'CONFLICT' });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 409 when the same operation ID is retried with a different role',
      async () => {
        const body = defaultBody();
        await postProvisioning(body).expect(200);

        const response = await postProvisioning({ ...body, role: 'HR' }).expect(409);

        expect(response.body).toMatchObject({ statusCode: 409, code: 'CONFLICT' });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 409 when a different operation ID asks for an email that differs only in letter case',
      async () => {
        const email = uniqueEmail('case.check');
        await postProvisioning(defaultBody({ email })).expect(200);

        const response = await postProvisioning(defaultBody({ email: email.toUpperCase() })).expect(
          409,
        );

        expect(response.body).toEqual({
          statusCode: 409,
          code: 'CONFLICT',
          message: EMAIL_IN_USE_MESSAGE,
        });
        expect(await countAccountsWithEmail(email)).toBe(1);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 200 with one account when two requests with the same operation ID run at the same time',
      async () => {
        const body = defaultBody();

        const [first, second] = await Promise.all([postProvisioning(body), postProvisioning(body)]);

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(second.body.accountId).toBe(first.body.accountId);
        expect(await countAccountsWithEmail(body.email)).toBe(1);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 200 with a PENDING operation when the requested role is HR',
      async () => {
        const body = defaultBody({ role: 'HR' });

        const response = await postProvisioning(body).expect(200);

        expect(response.body.status).toBe('PENDING');
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 400 when the initial password violates the password policy',
      async () => {
        const response = await postProvisioning(
          defaultBody({ initialPassword: 'onlyletters' }),
        ).expect(400);

        expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 403 when the actor is an EMPLOYEE account',
      async () => {
        const response = await postProvisioning(
          defaultBody({ actorAccountId: employeeAccountId }),
        ).expect(403);

        expect(response.body).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 403 when the actor does not exist',
      async () => {
        const response = await postProvisioning(
          defaultBody({ actorAccountId: randomUUID() }),
        ).expect(403);

        expect(response.body).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 403 when the caller is the API gateway rather than employee-service',
      async () => {
        const response = await postProvisioning(defaultBody(), gatewayToken).expect(403);

        expect(response.body).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 401 when the request carries no service token',
      async () => {
        const response = await request(app.getHttpServer())
          .post(PROVISIONING_PATH)
          .send(defaultBody())
          .expect(401);

        expect(response.body).toEqual(UNAUTHORIZED_BODY);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should not expose the initial password or a hash in any response body or log line',
      async () => {
        const body = defaultBody();
        const responses = [
          await postProvisioning(body).expect(200),
          await postProvisioning(body).expect(200),
          await postProvisioning({ ...body, role: 'HR' }).expect(409),
          await postProvisioning(defaultBody({ initialPassword: 'onlyletters' })).expect(400),
        ];

        const exposed = [
          ...responses.map((response) => JSON.stringify(response.body)),
          ...loggedMessages,
        ];
        for (const text of exposed) {
          expect(text).not.toContain(INITIAL_PASSWORD);
          expect(text).not.toContain('onlyletters');
          expect(text).not.toContain(ARGON2ID_PREFIX);
        }
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('activation and sign-in', () => {
    it(
      'should refuse sign-in with the generic 401 while the account is PENDING',
      async () => {
        const body = defaultBody();
        await postProvisioning(body).expect(200);

        const response = await signIn(body.email, INITIAL_PASSWORD, 'EMPLOYEE').expect(401);

        expect(response.body).toEqual(GENERIC_REFUSAL_BODY);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should omit a PENDING account from the account lookup',
      async () => {
        const created = await postProvisioning(defaultBody()).expect(200);

        const response = await request(app.getHttpServer())
          .post(LOOKUP_PATH)
          .set('Authorization', `Bearer ${gatewayToken}`)
          .send({ ids: [created.body.accountId] })
          .expect(200);

        expect(response.body).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return ACTIVE and let the account sign in when the operation is activated',
      async () => {
        const body = defaultBody();
        const created = await postProvisioning(body).expect(200);

        const activated = await postActivation(created.body.operationId).expect(200);
        const session = await signIn(body.email, INITIAL_PASSWORD, 'EMPLOYEE').expect(200);

        expect(activated.body).toEqual({
          operationId: body.operationId,
          accountId: created.body.accountId,
          status: 'ACTIVE',
        });
        expect(session.body.account).toMatchObject({ email: body.email, role: 'EMPLOYEE' });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should let an HR account created with role HR sign in on the HR portal after activation',
      async () => {
        const body = defaultBody({ role: 'HR' });
        const created = await postProvisioning(body).expect(200);
        await postActivation(created.body.operationId).expect(200);

        const session = await signIn(body.email, INITIAL_PASSWORD, 'HR').expect(200);

        expect(session.body.account).toMatchObject({ email: body.email, role: 'HR' });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return ACTIVE when the activation is repeated',
      async () => {
        const created = await postProvisioning(defaultBody()).expect(200);
        await postActivation(created.body.operationId).expect(200);

        const repeated = await postActivation(created.body.operationId).expect(200);

        expect(repeated.body.status).toBe('ACTIVE');
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 404 when the activation names an unknown operation',
      async () => {
        const response = await postActivation(randomUUID()).expect(404);

        expect(response.body).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should keep the account PENDING when a conflicting retry under the same ID is refused',
      async () => {
        const body = defaultBody();
        await postProvisioning(body).expect(200);
        await postProvisioning({ ...body, email: uniqueEmail('swapped') }).expect(409);

        const response = await signIn(body.email, INITIAL_PASSWORD, 'EMPLOYEE').expect(401);

        expect(response.body).toEqual(GENERIC_REFUSAL_BODY);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('GET /api/v1/internal/account-provisioning-operations/:operationId', () => {
    it(
      'should return the operation shape when the operation exists',
      async () => {
        const body = defaultBody();
        const created = await postProvisioning(body).expect(200);

        const response = await getOperation(body.operationId).expect(200);

        expect(response.body).toEqual({
          operationId: body.operationId,
          accountId: created.body.accountId,
          status: 'PENDING',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 404 when the operation does not exist',
      async () => {
        const response = await getOperation(randomUUID()).expect(404);

        expect(response.body).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
      },
      TEST_TIMEOUT_MS,
    );
  });
});
