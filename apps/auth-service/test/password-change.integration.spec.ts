import { jest } from '@jest/globals';
import { ServiceName, configureApp, parseConfig } from '@dexa/common';
import {
  accountPasswordChangedPayloadSchema,
  ErrorCode,
  loginResponseSchema,
  Role,
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
import {
  forgeGatewayUserToken,
  signEndUserJwt,
  signGatewayUserToken,
} from './gateway-user-token.js';

// Starting the container pulls an image on a cold machine, which exceeds Jest's 5 second default.
const CONTAINER_TIMEOUT_MS = 120_000;
// Each sign-in and each change runs argon2id more than once, which takes a noticeable fraction of a second.
const TEST_TIMEOUT_MS = 60_000;
const SESSIONS_PATH = '/api/v1/internal/sessions';
const PASSWORD_PATH = '/api/v1/auth/me/password';
const SERVICE_TOKEN_LIFETIME_SECONDS = 60;
const ARGON2ID_PREFIX = '$argon2id$';
const PASSWORD_CHANGED_EVENT_TYPE = 'account.password.changed';

const HR_EMAIL = 'hr.admin@dexa.test';
const HR_PASSWORD = 'hr-admin-pass-1';
// Distinct from every other string in the file, so a search for them in a row or a log is unambiguous.
const OLD_PASSWORD = 'Old-Secret-1';
const NEW_PASSWORD = 'New-Secret-2';
const OTHER_PASSWORD = 'Other-Secret-3';
const WRONG_CURRENT_PASSWORD = 'Wrong-Secret-9';
const POLICY_VIOLATING_PASSWORD = 'nodigitsatall';

const CURRENT_PASSWORD_INCORRECT_MESSAGE = 'The current password is incorrect.';
const PASSWORD_CONFLICT_MESSAGE = 'The password was changed by another request. Try again.';

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

// The token api-gateway sends to this service for the user. It lets a case reach the change for an account that
// sign-in refuses, such as a deactivated or still-provisioning one.
function signUserToken(accountId: string, role: Role): string {
  return signGatewayUserToken(TEST_KEYS, ServiceName.AUTH_SERVICE, accountId, role);
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

describe('self-service password change', () => {
  let container: StartedPostgreSqlContainer;
  let moduleRef: TestingModule;
  let app: INestApplication;
  let database: Database;
  let hasher: IPasswordHasher;
  let loggedMessages: string[];
  let gatewayToken: string;
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
    gatewayToken = await signServiceToken(ServiceName.API_GATEWAY, ServiceName.AUTH_SERVICE);
    hrAccountId = await findAccountIdByEmail(HR_EMAIL);
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

  async function insertEmployee(options: {
    readonly email: string;
    readonly password: string;
    readonly isActive?: boolean;
  }): Promise<string> {
    const rows = await database.db
      .insert(accounts)
      .values({
        companyEmail: options.email,
        passwordHash: await hasher.hash(options.password),
        roleId: await findRoleId('EMPLOYEE'),
        isActive: options.isActive ?? true,
      })
      .returning({ id: accounts.id });
    return requireRow(rows[0]).id;
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

  function postSession(body: Record<string, string>) {
    return request(app.getHttpServer())
      .post(SESSIONS_PATH)
      .set('Authorization', `Bearer ${gatewayToken}`)
      .send(body);
  }

  // Signs in, then returns the token that api-gateway sends to this service for the same user (D-51). The gateway
  // checks the end-user JWT, so this service only ever receives its own token.
  async function signIn(email: string, password: string, portal: string): Promise<string> {
    const response = await postSession({ email, password, portal });
    if (response.status !== 200) {
      throw new Error(`Sign-in answered ${response.status}, expected 200.`);
    }
    const session = loginResponseSchema.parse(response.body);
    return signGatewayUserToken(
      TEST_KEYS,
      ServiceName.AUTH_SERVICE,
      session.account.id,
      session.account.role,
    );
  }

  function changePassword(accessToken: string, body: Record<string, string>) {
    return request(app.getHttpServer())
      .patch(PASSWORD_PATH)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(body);
  }

  describe('PATCH /api/v1/auth/me/password', () => {
    it(
      'should return 204, then accept only the new password at sign-in, when the current password is correct',
      async () => {
        const email = uniqueEmail('change.success');
        const accountId = await insertEmployee({ email, password: OLD_PASSWORD });
        const accessToken = await signIn(email, OLD_PASSWORD, 'EMPLOYEE');

        await changePassword(accessToken, {
          currentPassword: OLD_PASSWORD,
          newPassword: NEW_PASSWORD,
        }).expect(204);

        expect(
          (await postSession({ email, password: OLD_PASSWORD, portal: 'EMPLOYEE' })).status,
        ).toBe(401);
        expect(
          (await postSession({ email, password: NEW_PASSWORD, portal: 'EMPLOYEE' })).status,
        ).toBe(200);
        expect((await readAccount(accountId)).passwordHash.startsWith(ARGON2ID_PREFIX)).toBe(true);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should write one account.password.changed row in the same transaction, with no password, hash, or token in it',
      async () => {
        const email = uniqueEmail('change.outbox');
        const accountId = await insertEmployee({ email, password: OLD_PASSWORD });
        const accessToken = await signIn(email, OLD_PASSWORD, 'EMPLOYEE');

        await changePassword(accessToken, {
          currentPassword: OLD_PASSWORD,
          newPassword: NEW_PASSWORD,
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
          payload: { accountId, actorAccountId: accountId, changedFields: ['password'] },
        });
        const storedRow = JSON.stringify(row);
        expect(storedRow).not.toContain(OLD_PASSWORD);
        expect(storedRow).not.toContain(NEW_PASSWORD);
        expect(storedRow).not.toContain(ARGON2ID_PREFIX);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 400 CURRENT_PASSWORD_INCORRECT, keep the stored hash, and write no row when the current password is wrong',
      async () => {
        const email = uniqueEmail('change.wrong');
        const accountId = await insertEmployee({ email, password: OLD_PASSWORD });
        const accessToken = await signIn(email, OLD_PASSWORD, 'EMPLOYEE');
        const hashBefore = (await readAccount(accountId)).passwordHash;

        const response = await changePassword(accessToken, {
          currentPassword: WRONG_CURRENT_PASSWORD,
          newPassword: NEW_PASSWORD,
        }).expect(400);

        expect(response.body).toEqual({
          statusCode: 400,
          code: ErrorCode.CURRENT_PASSWORD_INCORRECT,
          message: CURRENT_PASSWORD_INCORRECT_MESSAGE,
        });
        expect((await readAccount(accountId)).passwordHash).toBe(hashBefore);
        expect(await readPasswordChangedRows(accountId)).toHaveLength(0);
        expect(
          (await postSession({ email, password: OLD_PASSWORD, portal: 'EMPLOYEE' })).status,
        ).toBe(200);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 400 VALIDATION_FAILED and leave the password unchanged when the new password breaks the policy',
      async () => {
        const email = uniqueEmail('change.policy');
        const accountId = await insertEmployee({ email, password: OLD_PASSWORD });
        const accessToken = await signIn(email, OLD_PASSWORD, 'EMPLOYEE');

        const response = await changePassword(accessToken, {
          currentPassword: OLD_PASSWORD,
          newPassword: POLICY_VIOLATING_PASSWORD,
        }).expect(400);

        expect(response.body).toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
        expect(await readPasswordChangedRows(accountId)).toHaveLength(0);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 401 UNAUTHORIZED without a bearer token',
      async () => {
        const response = await request(app.getHttpServer())
          .patch(PASSWORD_PATH)
          .send({ currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD })
          .expect(401);

        expect(response.body).toMatchObject({ statusCode: 401, code: ErrorCode.UNAUTHORIZED });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 401 and change nothing when an end-user JWT is sent, because only the gateway verifies end-user tokens',
      async () => {
        const email = uniqueEmail('change.userjwt');
        const accountId = await insertEmployee({ email, password: OLD_PASSWORD });
        const endUserJwt = signEndUserJwt(TEST_KEYS, accountId, Role.EMPLOYEE);

        const response = await changePassword(endUserJwt, {
          currentPassword: OLD_PASSWORD,
          newPassword: NEW_PASSWORD,
        }).expect(401);

        expect(response.body).toMatchObject({ code: ErrorCode.UNAUTHORIZED });
        expect(await readPasswordChangedRows(accountId)).toHaveLength(0);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 401 and change nothing when a token names api-gateway but is signed with another service key',
      async () => {
        const email = uniqueEmail('change.forged');
        const accountId = await insertEmployee({ email, password: OLD_PASSWORD });
        const forged = forgeGatewayUserToken(
          TEST_KEYS,
          ServiceName.AUTH_SERVICE,
          accountId,
          Role.EMPLOYEE,
        );

        const response = await changePassword(forged, {
          currentPassword: OLD_PASSWORD,
          newPassword: NEW_PASSWORD,
        }).expect(401);

        expect(response.body).toMatchObject({ code: ErrorCode.UNAUTHORIZED });
        expect(await readPasswordChangedRows(accountId)).toHaveLength(0);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 401 UNAUTHORIZED when the account is still provisioning',
      async () => {
        const email = uniqueEmail('change.pending');
        const accountId = await insertEmployee({ email, password: OLD_PASSWORD });
        await database.db.insert(accountProvisioningOperations).values({
          operationId: randomUUID(),
          accountId,
          actorAccountId: hrAccountId,
          requestedEmail: email,
          requestedRole: 'EMPLOYEE',
          initialPasswordHash: await hasher.hash(OLD_PASSWORD),
          status: 'PENDING',
        });
        const accessToken = signUserToken(accountId, Role.EMPLOYEE);

        const response = await changePassword(accessToken, {
          currentPassword: OLD_PASSWORD,
          newPassword: NEW_PASSWORD,
        }).expect(401);

        expect(response.body).toMatchObject({ code: ErrorCode.UNAUTHORIZED });
        expect(await readPasswordChangedRows(accountId)).toHaveLength(0);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 401 ACCOUNT_DISABLED when the account has been deactivated',
      async () => {
        const email = uniqueEmail('change.inactive');
        const accountId = await insertEmployee({
          email,
          password: OLD_PASSWORD,
          isActive: false,
        });
        const accessToken = signUserToken(accountId, Role.EMPLOYEE);

        const response = await changePassword(accessToken, {
          currentPassword: OLD_PASSWORD,
          newPassword: NEW_PASSWORD,
        }).expect(401);

        expect(response.body).toMatchObject({ code: ErrorCode.ACCOUNT_DISABLED });
        expect(await readPasswordChangedRows(accountId)).toHaveLength(0);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 409 CONFLICT and write no row when another change commits between the check and the update',
      async () => {
        const email = uniqueEmail('change.stale');
        const accountId = await insertEmployee({ email, password: OLD_PASSWORD });
        const accessToken = await signIn(email, OLD_PASSWORD, 'EMPLOYEE');
        // The other change lands after this request verified the old password and before its update. The
        // hash call is the point where the request is outside the transaction, so the race is set up there.
        const otherChangeHash = await hasher.hash(OTHER_PASSWORD);
        const originalHash = hasher.hash.bind(hasher);
        const hashSpy = jest.spyOn(hasher, 'hash').mockImplementationOnce(async (password) => {
          await database.db
            .update(accounts)
            .set({ passwordHash: otherChangeHash })
            .where(eq(accounts.id, accountId));
          return originalHash(password);
        });

        let response: request.Response;
        try {
          response = await changePassword(accessToken, {
            currentPassword: OLD_PASSWORD,
            newPassword: NEW_PASSWORD,
          }).expect(409);
        } finally {
          hashSpy.mockRestore();
        }

        expect(response.body).toEqual({
          statusCode: 409,
          code: ErrorCode.CONFLICT,
          message: PASSWORD_CONFLICT_MESSAGE,
        });
        expect((await readAccount(accountId)).passwordHash).toBe(otherChangeHash);
        expect(await readPasswordChangedRows(accountId)).toHaveLength(0);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should let exactly one of two simultaneous changes with the same current password succeed',
      async () => {
        const email = uniqueEmail('change.race');
        const accountId = await insertEmployee({ email, password: OLD_PASSWORD });
        const firstToken = await signIn(email, OLD_PASSWORD, 'EMPLOYEE');
        const secondToken = await signIn(email, OLD_PASSWORD, 'EMPLOYEE');

        const responses = await Promise.all([
          changePassword(firstToken, { currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD }),
          changePassword(secondToken, {
            currentPassword: OLD_PASSWORD,
            newPassword: OTHER_PASSWORD,
          }),
        ]);

        const statuses = responses.map((response) => response.status).sort();
        // The loser is refused with 409 when both verified before either committed. It is refused with 400
        // when it verified after the winner committed, because the old password no longer matches.
        const loser = responses.find((response) => response.status !== 204);
        expect(statuses).toHaveLength(2);
        expect(statuses.filter((status) => status === 204)).toHaveLength(1);
        expect([409, 400]).toContain(loser?.status);
        expect(await readPasswordChangedRows(accountId)).toHaveLength(1);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should keep passwords and hashes out of the logs when a change succeeds or is refused',
      async () => {
        const email = uniqueEmail('change.logs');
        await insertEmployee({ email, password: OLD_PASSWORD });
        const accessToken = await signIn(email, OLD_PASSWORD, 'EMPLOYEE');
        await changePassword(accessToken, {
          currentPassword: WRONG_CURRENT_PASSWORD,
          newPassword: NEW_PASSWORD,
        }).expect(400);
        await changePassword(accessToken, {
          currentPassword: OLD_PASSWORD,
          newPassword: NEW_PASSWORD,
        }).expect(204);

        const logged = loggedMessages.join('\n');
        expect(logged).not.toContain(OLD_PASSWORD);
        expect(logged).not.toContain(NEW_PASSWORD);
        expect(logged).not.toContain(WRONG_CURRENT_PASSWORD);
        expect(logged).not.toContain(ARGON2ID_PREFIX);
      },
      TEST_TIMEOUT_MS,
    );
  });
});
