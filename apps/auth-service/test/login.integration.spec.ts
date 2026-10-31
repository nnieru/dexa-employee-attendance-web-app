import { ServiceName, configureApp, parseConfig } from '@dexa/common';
import { type Role } from '@dexa/contracts';
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
import {
  accountProvisioningOperations,
  accounts,
  masterRoles,
} from '../src/infrastructure/db/schema.js';
import {
  authServiceEnvironment,
  generateAuthKeySet,
  servicePair,
  type AuthKeySet,
} from './auth-key-set.js';
import {
  forgeGatewayUserToken,
  signEndUserJwt,
  signGatewayUserToken,
} from './gateway-user-token.js';

// Starting the container pulls an image on a cold machine, which exceeds Jest's 5 second default.
const CONTAINER_TIMEOUT_MS = 120_000;
// Each sign-in runs one argon2id verification, which takes a noticeable fraction of a second.
const TEST_TIMEOUT_MS = 60_000;
const SESSIONS_PATH = '/api/v1/internal/sessions';
const CURRENT_ACCOUNT_PATH = '/api/v1/auth/me';
const SERVICE_TOKEN_LIFETIME_SECONDS = 60;
const ARGON2ID_PREFIX = '$argon2id$';

const HR_EMAIL = 'hr.admin@dexa.test';
const HR_PASSWORD = 'hr-admin-pass-1';
const EMPLOYEE_EMAIL = 'nadia.rahma@dexa.test';
const EMPLOYEE_PASSWORD = 'employee-pass-1';
const INACTIVE_EMAIL = 'inactive.employee@dexa.test';
const PENDING_EMAIL = 'pending.employee@dexa.test';
const UNKNOWN_EMAIL = 'nobody@dexa.test';
const WRONG_PASSWORD = 'wrong-pass-9';

const GENERIC_REFUSAL_BODY = {
  statusCode: 401,
  code: 'INVALID_CREDENTIALS',
  message: 'Invalid email or password.',
};
const UNAUTHORIZED_BODY = { statusCode: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' };

const jwtService = new JwtService();
// Generated once for the file. The keys are only as valid as the config needs.
const TEST_KEYS: AuthKeySet = generateAuthKeySet();

// The token api-gateway sends to /auth/me for this user, after it checked the sign-in token (D-51).
function gatewayTokenFor(account: { readonly id: string; readonly role: Role }): string {
  return signGatewayUserToken(TEST_KEYS, ServiceName.AUTH_SERVICE, account.id, account.role);
}

type SignInBody = { readonly email?: string; readonly password?: string; readonly portal?: string };

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

describe('login and sessions', () => {
  let container: StartedPostgreSqlContainer;
  let moduleRef: TestingModule;
  let app: INestApplication;
  let database: Database;
  let hasher: IPasswordHasher;
  let loggedMessages: string[];
  let gatewayToken: string;
  let employeeServiceToken: string;

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
    await seedAccounts();
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

  async function findRoleId(roleCode: string): Promise<string> {
    const rows = await database.db
      .select({ id: masterRoles.id })
      .from(masterRoles)
      .where(eq(masterRoles.code, roleCode));
    return requireRow(rows[0]).id;
  }

  async function insertAccount(options: {
    readonly email: string;
    readonly password: string;
    readonly roleCode: string;
    readonly isActive?: boolean;
  }): Promise<string> {
    const rows = await database.db
      .insert(accounts)
      .values({
        companyEmail: options.email,
        passwordHash: await hasher.hash(options.password),
        roleId: await findRoleId(options.roleCode),
        isActive: options.isActive ?? true,
      })
      .returning({ id: accounts.id });
    return requireRow(rows[0]).id;
  }

  // The accounts that the sign-in cases use. The HR account comes from the bootstrap configuration.
  async function seedAccounts(): Promise<void> {
    await insertAccount({
      email: EMPLOYEE_EMAIL,
      password: EMPLOYEE_PASSWORD,
      roleCode: 'EMPLOYEE',
    });
    await insertAccount({
      email: INACTIVE_EMAIL,
      password: EMPLOYEE_PASSWORD,
      roleCode: 'EMPLOYEE',
      isActive: false,
    });
    const pendingAccountId = await insertAccount({
      email: PENDING_EMAIL,
      password: EMPLOYEE_PASSWORD,
      roleCode: 'EMPLOYEE',
    });
    const hrRows = await database.db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.companyEmail, HR_EMAIL));
    await database.db.insert(accountProvisioningOperations).values({
      operationId: randomUUID(),
      accountId: pendingAccountId,
      actorAccountId: requireRow(hrRows[0]).id,
      requestedEmail: PENDING_EMAIL,
      requestedRole: 'EMPLOYEE',
      initialPasswordHash: await hasher.hash(EMPLOYEE_PASSWORD),
      status: 'PENDING',
    });
  }

  function postSession(body: SignInBody, serviceToken: string = gatewayToken) {
    return request(app.getHttpServer())
      .post(SESSIONS_PATH)
      .set('Authorization', `Bearer ${serviceToken}`)
      .send(body);
  }

  function signIn(email: string, password: string, portal: string) {
    return postSession({ email, password, portal });
  }

  describe('POST /api/v1/internal/sessions', () => {
    it(
      'should return 200 with a bearer token and the account when an EMPLOYEE signs in on the employee portal',
      async () => {
        const response = await signIn(EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD, 'EMPLOYEE').expect(200);

        expect(response.body).toEqual({
          accessToken: expect.any(String),
          tokenType: 'Bearer',
          expiresIn: 3600,
          account: { id: expect.any(String), email: EMPLOYEE_EMAIL, role: 'EMPLOYEE' },
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 200 with the HR role when an HR account signs in on the employee portal',
      async () => {
        const response = await signIn(HR_EMAIL, HR_PASSWORD, 'EMPLOYEE').expect(200);

        expect(response.body.account).toMatchObject({ email: HR_EMAIL, role: 'HR' });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 200 with the HR role when an HR account signs in on the HR portal',
      async () => {
        const response = await signIn(HR_EMAIL, HR_PASSWORD, 'HR').expect(200);

        expect(response.body.account).toMatchObject({ email: HR_EMAIL, role: 'HR' });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 401 INVALID_CREDENTIALS when an EMPLOYEE account signs in on the HR portal',
      async () => {
        const response = await signIn(EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD, 'HR').expect(401);

        expect(response.body).toEqual(GENERIC_REFUSAL_BODY);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return byte-identical 401 bodies when the email is unknown, the password is wrong, the account is inactive, or provisioning is pending',
      async () => {
        const refusals = [
          signIn(UNKNOWN_EMAIL, EMPLOYEE_PASSWORD, 'EMPLOYEE'),
          signIn(EMPLOYEE_EMAIL, WRONG_PASSWORD, 'EMPLOYEE'),
          signIn(INACTIVE_EMAIL, EMPLOYEE_PASSWORD, 'EMPLOYEE'),
          signIn(PENDING_EMAIL, EMPLOYEE_PASSWORD, 'EMPLOYEE'),
        ];

        const bodies = await Promise.all(
          refusals.map(async (refusal) => (await refusal.expect(401)).text),
        );

        expect(new Set(bodies)).toEqual(new Set([JSON.stringify(GENERIC_REFUSAL_BODY)]));
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 401 when the request carries no service token',
      async () => {
        const response = await request(app.getHttpServer())
          .post(SESSIONS_PATH)
          .send({ email: EMPLOYEE_EMAIL, password: EMPLOYEE_PASSWORD, portal: 'EMPLOYEE' })
          .expect(401);

        expect(response.body).toEqual(UNAUTHORIZED_BODY);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 401 when the service token is addressed to another service',
      async () => {
        const tokenForAttendance = await signServiceToken(
          ServiceName.API_GATEWAY,
          ServiceName.ATTENDANCE_SERVICE,
        );

        const response = await postSession(
          { email: EMPLOYEE_EMAIL, password: EMPLOYEE_PASSWORD, portal: 'EMPLOYEE' },
          tokenForAttendance,
        ).expect(401);

        expect(response.body).toEqual(UNAUTHORIZED_BODY);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 403 when a valid service token belongs to a service other than the gateway',
      async () => {
        const response = await postSession(
          { email: EMPLOYEE_EMAIL, password: EMPLOYEE_PASSWORD, portal: 'EMPLOYEE' },
          employeeServiceToken,
        ).expect(403);

        expect(response.body).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 400 VALIDATION_FAILED when the portal is missing',
      async () => {
        const response = await postSession({
          email: EMPLOYEE_EMAIL,
          password: EMPLOYEE_PASSWORD,
        }).expect(400);

        expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 400 rather than 401 when the email is missing, because the body is checked before the credentials',
      async () => {
        const response = await postSession({
          password: EMPLOYEE_PASSWORD,
          portal: 'EMPLOYEE',
        }).expect(400);

        expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should keep the password and its hash out of responses and logs for both a success and a refusal',
      async () => {
        loggedMessages.length = 0;
        const success = await signIn(EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD, 'EMPLOYEE').expect(200);
        const refusal = await signIn(EMPLOYEE_EMAIL, WRONG_PASSWORD, 'EMPLOYEE').expect(401);

        const exposed = [success.text, refusal.text, loggedMessages.join('\n')].join('\n');
        expect(exposed).not.toContain(EMPLOYEE_PASSWORD);
        expect(exposed).not.toContain(WRONG_PASSWORD);
        expect(exposed).not.toContain(ARGON2ID_PREFIX);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('GET /api/v1/auth/me', () => {
    it(
      'should return the account when the access token belongs to an active account',
      async () => {
        const session = (await signIn(EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD, 'EMPLOYEE').expect(200))
          .body;

        const response = await request(app.getHttpServer())
          .get(CURRENT_ACCOUNT_PATH)
          .set('Authorization', `Bearer ${gatewayTokenFor(session.account)}`)
          .expect(200);

        expect(response.body).toEqual(session.account);
      },
      TEST_TIMEOUT_MS,
    );

    it('should return 401 when no bearer token is sent', async () => {
      const response = await request(app.getHttpServer()).get(CURRENT_ACCOUNT_PATH).expect(401);

      expect(response.body).toEqual(UNAUTHORIZED_BODY);
    });

    it('should return 401 when an end-user JWT is sent, because only the gateway verifies end-user tokens', async () => {
      const session = (await signIn(EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD, 'EMPLOYEE').expect(200))
        .body;
      const endUserJwt = signEndUserJwt(TEST_KEYS, session.account.id, session.account.role);

      const response = await request(app.getHttpServer())
        .get(CURRENT_ACCOUNT_PATH)
        .set('Authorization', `Bearer ${endUserJwt}`)
        .expect(401);

      expect(response.body).toEqual(UNAUTHORIZED_BODY);
    });

    it('should return 401 when a token names api-gateway but is signed with another service key', async () => {
      const session = (await signIn(EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD, 'EMPLOYEE').expect(200))
        .body;
      const forged = forgeGatewayUserToken(
        TEST_KEYS,
        ServiceName.AUTH_SERVICE,
        session.account.id,
        session.account.role,
      );

      const response = await request(app.getHttpServer())
        .get(CURRENT_ACCOUNT_PATH)
        .set('Authorization', `Bearer ${forged}`)
        .expect(401);

      expect(response.body).toEqual(UNAUTHORIZED_BODY);
    });

    it(
      'should return 401 ACCOUNT_DISABLED when the account was deactivated after its token was issued',
      async () => {
        const email = `leaving.${randomUUID()}@dexa.test`;
        await insertAccount({ email, password: EMPLOYEE_PASSWORD, roleCode: 'EMPLOYEE' });
        const session = (await signIn(email, EMPLOYEE_PASSWORD, 'EMPLOYEE').expect(200)).body;
        await database.db
          .update(accounts)
          .set({ isActive: false })
          .where(eq(accounts.companyEmail, email));

        const response = await request(app.getHttpServer())
          .get(CURRENT_ACCOUNT_PATH)
          .set('Authorization', `Bearer ${gatewayTokenFor(session.account)}`)
          .expect(401);

        expect(response.body).toMatchObject({ statusCode: 401, code: 'ACCOUNT_DISABLED' });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return the same ACCOUNT_DISABLED body as the gateway when the account was deactivated after its token was issued',
      async () => {
        const email = `refused.${randomUUID()}@dexa.test`;
        await insertAccount({ email, password: EMPLOYEE_PASSWORD, roleCode: 'EMPLOYEE' });
        const session = (await signIn(email, EMPLOYEE_PASSWORD, 'EMPLOYEE').expect(200)).body;
        await database.db
          .update(accounts)
          .set({ isActive: false })
          .where(eq(accounts.companyEmail, email));

        const response = await request(app.getHttpServer())
          .get(CURRENT_ACCOUNT_PATH)
          .set('Authorization', `Bearer ${gatewayTokenFor(session.account)}`)
          .expect(401);

        // The shared JwtAuthGuard answers before the service runs, with the message the gateway sends.
        expect(response.body).toEqual({
          statusCode: 401,
          code: 'ACCOUNT_DISABLED',
          message: 'This account is no longer active.',
        });
      },
      TEST_TIMEOUT_MS,
    );
  });
});
