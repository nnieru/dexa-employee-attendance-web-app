import { ServiceName, configureApp, parseConfig } from '@dexa/common';
import {
  accountPasswordChangedPayloadSchema,
  ErrorCode,
  loginResponseSchema,
} from '@dexa/contracts';
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
  outboxEvents,
} from '../src/infrastructure/db/schema.js';
import {
  authServiceEnvironment,
  generateAuthKeySet,
  servicePair,
  type AuthKeySet,
} from './auth-key-set.js';

// Starting the container pulls an image on a cold machine, which exceeds Jest's 5 second default.
const CONTAINER_TIMEOUT_MS = 120_000;
// Each reset and sign-in runs argon2id more than once, which takes a noticeable fraction of a second.
const TEST_TIMEOUT_MS = 60_000;
const ACCOUNTS_PATH = '/api/v1/internal/accounts';
const SESSIONS_PATH = '/api/v1/internal/sessions';
const SERVICE_TOKEN_LIFETIME_SECONDS = 60;
const ARGON2ID_PREFIX = '$argon2id$';
const PASSWORD_CHANGED_EVENT_TYPE = 'account.password.changed';

const HR_EMAIL = 'hr.admin@dexa.test';
const HR_PASSWORD = 'hr-admin-pass-1';
// Distinct from every other string in the file, so a search for them in a row or a log is unambiguous.
const OLD_PASSWORD = 'Old-Secret-1';
const RESET_PASSWORD = 'Reset-Secret-2';
const INITIAL_PASSWORD = 'Initial-Secret-3';
const WRONG_PASSWORD = 'Wrong-Secret-9';
const POLICY_VIOLATING_PASSWORD = 'nodigitsatall';

const ACCOUNT_NOT_FOUND_MESSAGE = 'The account was not found.';
const ACTOR_NOT_ELIGIBLE_MESSAGE = 'Only an active HR account can change other accounts.';
const SELF_DEACTIVATION_MESSAGE = 'An HR account cannot deactivate its own account.';

const jwtService = new JwtService();
// Generated once for the file. The keys are only as valid as the config needs.
const TEST_KEYS: AuthKeySet = generateAuthKeySet();

type AccountRow = typeof accounts.$inferSelect;
type OutboxRow = typeof outboxEvents.$inferSelect;

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

describe('HR account administration', () => {
  let container: StartedPostgreSqlContainer;
  let moduleRef: TestingModule;
  let app: INestApplication;
  let database: Database;
  let hasher: IPasswordHasher;
  let loggedMessages: string[];
  let gatewayToken: string;
  let employeeServiceToken: string;
  let hrAccountId: string;

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

  async function findAccountIdByEmail(email: string): Promise<string> {
    const rows = await database.db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.companyEmail, email));
    return requireRow(rows[0]).id;
  }

  async function readAccount(accountId: string): Promise<AccountRow> {
    const rows = await database.db.select().from(accounts).where(eq(accounts.id, accountId));
    return requireRow(rows[0]);
  }

  async function insertAccount(options: {
    readonly email: string;
    readonly password: string;
    readonly roleCode?: string;
    readonly isActive?: boolean;
  }): Promise<string> {
    const rows = await database.db
      .insert(accounts)
      .values({
        companyEmail: options.email,
        passwordHash: await hasher.hash(options.password),
        roleId: await findRoleId(options.roleCode ?? 'EMPLOYEE'),
        isActive: options.isActive ?? true,
      })
      .returning({ id: accounts.id });
    return requireRow(rows[0]).id;
  }

  // An account that provisioning created. Its operation keeps the initial verifier, which a reset must not touch.
  async function insertProvisionedAccount(options: {
    readonly email: string;
    readonly initialPassword: string;
    readonly status: 'PENDING' | 'ACTIVE';
  }): Promise<string> {
    const accountId = await insertAccount({
      email: options.email,
      password: options.initialPassword,
    });
    await database.db.insert(accountProvisioningOperations).values({
      operationId: randomUUID(),
      accountId,
      actorAccountId: hrAccountId,
      requestedEmail: options.email,
      requestedRole: 'EMPLOYEE',
      initialPasswordHash: await hasher.hash(options.initialPassword),
      status: options.status,
    });
    return accountId;
  }

  async function readInitialPasswordHash(accountId: string): Promise<string> {
    const rows = await database.db
      .select({ hash: accountProvisioningOperations.initialPasswordHash })
      .from(accountProvisioningOperations)
      .where(eq(accountProvisioningOperations.accountId, accountId));
    return requireRow(rows[0]).hash;
  }

  // Outbox rows for one account. The payload carries the account ID, so filtering in code keeps each
  // case independent of the rows that other cases wrote.
  async function readPasswordChangedRows(accountId: string): Promise<OutboxRow[]> {
    const rows = await database.db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.eventType, PASSWORD_CHANGED_EVENT_TYPE));
    return rows.filter((row) => {
      const payload = accountPasswordChangedPayloadSchema.safeParse(row.payload.payload);
      return payload.success && payload.data.accountId === accountId;
    });
  }

  async function countOutboxRows(): Promise<number> {
    const rows = await database.db.select({ id: outboxEvents.id }).from(outboxEvents);
    return rows.length;
  }

  function postSession(body: Record<string, string>) {
    return request(app.getHttpServer())
      .post(SESSIONS_PATH)
      .set('Authorization', `Bearer ${gatewayToken}`)
      .send(body);
  }

  async function signIn(email: string, password: string): Promise<string> {
    const response = await postSession({ email, password, portal: 'EMPLOYEE' });
    if (response.status !== 200) {
      throw new Error(`Sign-in answered ${response.status}, expected 200.`);
    }
    return loginResponseSchema.parse(response.body).accessToken;
  }

  function resetPassword(
    accountId: string,
    body: Record<string, string>,
    callerToken: string = employeeServiceToken,
  ) {
    return request(app.getHttpServer())
      .put(`${ACCOUNTS_PATH}/${accountId}/password`)
      .set('Authorization', `Bearer ${callerToken}`)
      .send(body);
  }

  function setActiveStatus(
    accountId: string,
    body: Record<string, unknown>,
    callerToken: string = employeeServiceToken,
  ) {
    return request(app.getHttpServer())
      .put(`${ACCOUNTS_PATH}/${accountId}/active-status`)
      .set('Authorization', `Bearer ${callerToken}`)
      .send(body);
  }

  describe('PUT /api/v1/internal/accounts/:id/password', () => {
    it(
      'should return 204 and accept only the new password at sign-in, when an HR account resets it',
      async () => {
        const email = uniqueEmail('reset.success');
        const accountId = await insertAccount({ email, password: OLD_PASSWORD });

        await resetPassword(accountId, {
          actorAccountId: hrAccountId,
          newPassword: RESET_PASSWORD,
        }).expect(204);

        const oldResponse = await postSession({
          email,
          password: OLD_PASSWORD,
          portal: 'EMPLOYEE',
        }).expect(401);
        expect(oldResponse.body).toMatchObject({ code: ErrorCode.INVALID_CREDENTIALS });
        await signIn(email, RESET_PASSWORD);
        expect((await readAccount(accountId)).passwordHash.startsWith(ARGON2ID_PREFIX)).toBe(true);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should write one account.password.changed row that names the HR actor, with no password or hash in it',
      async () => {
        const email = uniqueEmail('reset.outbox');
        const accountId = await insertAccount({ email, password: OLD_PASSWORD });

        await resetPassword(accountId, {
          actorAccountId: hrAccountId,
          newPassword: RESET_PASSWORD,
        }).expect(204);

        const rows = await readPasswordChangedRows(accountId);
        expect(rows).toHaveLength(1);
        const [row] = rows;
        // The broker is unreachable in this test, so the relay never marks the row published.
        expect(row).toMatchObject({ eventType: PASSWORD_CHANGED_EVENT_TYPE, publishedAt: null });
        expect(row?.payload).toEqual({
          eventId: row?.id,
          type: PASSWORD_CHANGED_EVENT_TYPE,
          occurredAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          payload: {
            accountId,
            actorAccountId: hrAccountId,
            changedFields: ['password'],
          },
        });
        const storedRow = JSON.stringify(row);
        expect(storedRow).not.toContain(OLD_PASSWORD);
        expect(storedRow).not.toContain(RESET_PASSWORD);
        expect(storedRow).not.toContain(ARGON2ID_PREFIX);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 400 VALIDATION_FAILED and keep the stored hash when the new password breaks the policy',
      async () => {
        const email = uniqueEmail('reset.policy');
        const accountId = await insertAccount({ email, password: OLD_PASSWORD });
        const hashBefore = (await readAccount(accountId)).passwordHash;

        const response = await resetPassword(accountId, {
          actorAccountId: hrAccountId,
          newPassword: POLICY_VIOLATING_PASSWORD,
        }).expect(400);

        expect(response.body).toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
        expect((await readAccount(accountId)).passwordHash).toBe(hashBefore);
        expect(await readPasswordChangedRows(accountId)).toHaveLength(0);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 404 NOT_FOUND and write no row when the account does not exist',
      async () => {
        const outboxRowsBefore = await countOutboxRows();

        const response = await resetPassword(randomUUID(), {
          actorAccountId: hrAccountId,
          newPassword: RESET_PASSWORD,
        }).expect(404);

        expect(response.body).toEqual({
          statusCode: 404,
          code: ErrorCode.NOT_FOUND,
          message: ACCOUNT_NOT_FOUND_MESSAGE,
        });
        expect(await countOutboxRows()).toBe(outboxRowsBefore);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 404 NOT_FOUND and keep the account unchanged when the account is still provisioning',
      async () => {
        const email = uniqueEmail('reset.pending');
        const accountId = await insertProvisionedAccount({
          email,
          initialPassword: INITIAL_PASSWORD,
          status: 'PENDING',
        });
        const hashBefore = (await readAccount(accountId)).passwordHash;

        const response = await resetPassword(accountId, {
          actorAccountId: hrAccountId,
          newPassword: RESET_PASSWORD,
        }).expect(404);

        expect(response.body).toMatchObject({ code: ErrorCode.NOT_FOUND });
        expect((await readAccount(accountId)).passwordHash).toBe(hashBefore);
        expect(await readPasswordChangedRows(accountId)).toHaveLength(0);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should keep the initial provisioning verifier unchanged when the account was provisioned and activated',
      async () => {
        const email = uniqueEmail('reset.provisioned');
        const accountId = await insertProvisionedAccount({
          email,
          initialPassword: INITIAL_PASSWORD,
          status: 'ACTIVE',
        });
        const initialHashBefore = await readInitialPasswordHash(accountId);

        await resetPassword(accountId, {
          actorAccountId: hrAccountId,
          newPassword: RESET_PASSWORD,
        }).expect(204);

        expect(await readInitialPasswordHash(accountId)).toBe(initialHashBefore);
        expect(
          (await postSession({ email, password: INITIAL_PASSWORD, portal: 'EMPLOYEE' })).status,
        ).toBe(401);
        await signIn(email, RESET_PASSWORD);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reset the password of an inactive account and leave it inactive',
      async () => {
        const email = uniqueEmail('reset.inactive');
        const accountId = await insertAccount({
          email,
          password: OLD_PASSWORD,
          isActive: false,
        });

        await resetPassword(accountId, {
          actorAccountId: hrAccountId,
          newPassword: RESET_PASSWORD,
        }).expect(204);

        expect((await readAccount(accountId)).isActive).toBe(false);
        expect(
          (await postSession({ email, password: RESET_PASSWORD, portal: 'EMPLOYEE' })).status,
        ).toBe(401);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 403 FORBIDDEN and change nothing when the actor is an EMPLOYEE account',
      async () => {
        const actorAccountId = await insertAccount({
          email: uniqueEmail('reset.actor.employee'),
          password: OLD_PASSWORD,
        });
        const email = uniqueEmail('reset.target.byemployee');
        const accountId = await insertAccount({ email, password: OLD_PASSWORD });
        const hashBefore = (await readAccount(accountId)).passwordHash;

        const response = await resetPassword(accountId, {
          actorAccountId,
          newPassword: RESET_PASSWORD,
        }).expect(403);

        expect(response.body).toEqual({
          statusCode: 403,
          code: ErrorCode.FORBIDDEN,
          message: ACTOR_NOT_ELIGIBLE_MESSAGE,
        });
        expect((await readAccount(accountId)).passwordHash).toBe(hashBefore);
        expect(await readPasswordChangedRows(accountId)).toHaveLength(0);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 403 FORBIDDEN when the caller is the api-gateway rather than employee-service',
      async () => {
        const accountId = await insertAccount({
          email: uniqueEmail('reset.caller'),
          password: OLD_PASSWORD,
        });

        const response = await resetPassword(
          accountId,
          { actorAccountId: hrAccountId, newPassword: RESET_PASSWORD },
          gatewayToken,
        ).expect(403);

        expect(response.body).toMatchObject({ code: ErrorCode.FORBIDDEN });
        expect(await readPasswordChangedRows(accountId)).toHaveLength(0);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 401 UNAUTHORIZED without a service token',
      async () => {
        const accountId = await insertAccount({
          email: uniqueEmail('reset.notoken'),
          password: OLD_PASSWORD,
        });

        const response = await request(app.getHttpServer())
          .put(`${ACCOUNTS_PATH}/${accountId}/password`)
          .send({ actorAccountId: hrAccountId, newPassword: RESET_PASSWORD })
          .expect(401);

        expect(response.body).toMatchObject({ code: ErrorCode.UNAUTHORIZED });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 400 VALIDATION_FAILED when the account ID is not a UUID',
      async () => {
        const response = await resetPassword('not-a-uuid', {
          actorAccountId: hrAccountId,
          newPassword: RESET_PASSWORD,
        }).expect(400);

        expect(response.body).toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should keep passwords and hashes out of the logs when a reset succeeds',
      async () => {
        const accountId = await insertAccount({
          email: uniqueEmail('reset.logs'),
          password: OLD_PASSWORD,
        });
        await resetPassword(accountId, {
          actorAccountId: hrAccountId,
          newPassword: RESET_PASSWORD,
        }).expect(204);

        const logged = loggedMessages.join('\n');
        expect(logged).not.toContain(OLD_PASSWORD);
        expect(logged).not.toContain(RESET_PASSWORD);
        expect(logged).not.toContain(ARGON2ID_PREFIX);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('PUT /api/v1/internal/accounts/:id/active-status', () => {
    it(
      'should return 200 with isActive false, then refuse sign-in with the same body as a wrong password',
      async () => {
        const email = uniqueEmail('status.deactivate');
        const accountId = await insertAccount({ email, password: OLD_PASSWORD });
        await signIn(email, OLD_PASSWORD);

        const response = await setActiveStatus(accountId, {
          actorAccountId: hrAccountId,
          isActive: false,
        }).expect(200);

        expect(response.body).toEqual({ isActive: false });
        const refusedSignIn = await postSession({
          email,
          password: OLD_PASSWORD,
          portal: 'EMPLOYEE',
        }).expect(401);
        const wrongPasswordSignIn = await postSession({
          email,
          password: WRONG_PASSWORD,
          portal: 'EMPLOYEE',
        }).expect(401);
        expect(refusedSignIn.body).toEqual(wrongPasswordSignIn.body);
        expect(refusedSignIn.body).toMatchObject({ code: ErrorCode.INVALID_CREDENTIALS });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 200 with isActive true, and accept sign-in again once reactivated',
      async () => {
        const email = uniqueEmail('status.reactivate');
        const accountId = await insertAccount({
          email,
          password: OLD_PASSWORD,
          isActive: false,
        });

        const response = await setActiveStatus(accountId, {
          actorAccountId: hrAccountId,
          isActive: true,
        }).expect(200);

        expect(response.body).toEqual({ isActive: true });
        await signIn(email, OLD_PASSWORD);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 200 with the unchanged flag when the same value is sent again',
      async () => {
        const accountId = await insertAccount({
          email: uniqueEmail('status.repeat'),
          password: OLD_PASSWORD,
        });

        await setActiveStatus(accountId, { actorAccountId: hrAccountId, isActive: false }).expect(
          200,
        );
        const repeated = await setActiveStatus(accountId, {
          actorAccountId: hrAccountId,
          isActive: false,
        }).expect(200);

        expect(repeated.body).toEqual({ isActive: false });
        expect((await readAccount(accountId)).isActive).toBe(false);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 409 CONFLICT and keep the HR account active when the actor deactivates itself',
      async () => {
        const response = await setActiveStatus(hrAccountId, {
          actorAccountId: hrAccountId,
          isActive: false,
        }).expect(409);

        expect(response.body).toEqual({
          statusCode: 409,
          code: ErrorCode.CONFLICT,
          message: SELF_DEACTIVATION_MESSAGE,
        });
        expect((await readAccount(hrAccountId)).isActive).toBe(true);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 404 NOT_FOUND when the account does not exist',
      async () => {
        const response = await setActiveStatus(randomUUID(), {
          actorAccountId: hrAccountId,
          isActive: false,
        }).expect(404);

        expect(response.body).toEqual({
          statusCode: 404,
          code: ErrorCode.NOT_FOUND,
          message: ACCOUNT_NOT_FOUND_MESSAGE,
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 404 NOT_FOUND and keep the account unchanged when the account is still provisioning',
      async () => {
        const accountId = await insertProvisionedAccount({
          email: uniqueEmail('status.pending'),
          initialPassword: INITIAL_PASSWORD,
          status: 'PENDING',
        });

        await setActiveStatus(accountId, { actorAccountId: hrAccountId, isActive: false }).expect(
          404,
        );

        expect((await readAccount(accountId)).isActive).toBe(true);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should write no outbox row for an active-status change',
      async () => {
        const accountId = await insertAccount({
          email: uniqueEmail('status.outbox'),
          password: OLD_PASSWORD,
        });
        const outboxRowsBefore = await countOutboxRows();

        await setActiveStatus(accountId, { actorAccountId: hrAccountId, isActive: false }).expect(
          200,
        );
        await setActiveStatus(accountId, { actorAccountId: hrAccountId, isActive: true }).expect(
          200,
        );

        expect(await countOutboxRows()).toBe(outboxRowsBefore);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 403 FORBIDDEN and leave the flag unchanged when the actor is an EMPLOYEE account',
      async () => {
        const actorAccountId = await insertAccount({
          email: uniqueEmail('status.actor.employee'),
          password: OLD_PASSWORD,
        });
        const accountId = await insertAccount({
          email: uniqueEmail('status.target.byemployee'),
          password: OLD_PASSWORD,
        });

        const response = await setActiveStatus(accountId, {
          actorAccountId,
          isActive: false,
        }).expect(403);

        expect(response.body).toMatchObject({ code: ErrorCode.FORBIDDEN });
        expect((await readAccount(accountId)).isActive).toBe(true);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 403 FORBIDDEN when the caller is the api-gateway rather than employee-service',
      async () => {
        const accountId = await insertAccount({
          email: uniqueEmail('status.caller'),
          password: OLD_PASSWORD,
        });

        const response = await setActiveStatus(
          accountId,
          { actorAccountId: hrAccountId, isActive: false },
          gatewayToken,
        ).expect(403);

        expect(response.body).toMatchObject({ code: ErrorCode.FORBIDDEN });
        expect((await readAccount(accountId)).isActive).toBe(true);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 400 VALIDATION_FAILED when isActive is not a boolean',
      async () => {
        const accountId = await insertAccount({
          email: uniqueEmail('status.badvalue'),
          password: OLD_PASSWORD,
        });

        const response = await setActiveStatus(accountId, {
          actorAccountId: hrAccountId,
          isActive: 'false',
        }).expect(400);

        expect(response.body).toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
        expect((await readAccount(accountId)).isActive).toBe(true);
      },
      TEST_TIMEOUT_MS,
    );
  });
});
