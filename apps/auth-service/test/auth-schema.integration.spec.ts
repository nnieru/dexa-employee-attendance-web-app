import { parseConfig } from '@dexa/common';
import type { Database } from '@dexa/db';
import { Test, type TestingModule } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { authServiceEnvironment, generateAuthKeySet } from './auth-key-set.js';
import { AuthServiceConfigSchema } from '../src/config/auth-service-config.schema.js';
import { ConfigModule } from '../src/config/config.module.js';
import { DatabaseModule } from '../src/infrastructure/db/database.module.js';
import { DATABASE } from '../src/infrastructure/db/database.token.js';
import {
  accountProvisioningOperations,
  accounts,
  masterRoles,
} from '../src/infrastructure/db/schema.js';

// Starting the container pulls an image on a cold machine, which exceeds Jest's 5 second default.
const CONTAINER_TIMEOUT_MS = 120_000;
const PLACEHOLDER_PASSWORD_HASH = '$argon2id$placeholder-not-a-real-hash';
// Trigger tests start from an instant far in the past, so any database-clock value is later.
const PAST_INSTANT = new Date('2000-01-01T00:00:00.000Z');
// Generated once for the file. The config needs well-formed keys to pass validation.
const TEST_KEYS = generateAuthKeySet();

// ON DELETE RESTRICT raises restrict_violation. ON DELETE NO ACTION would raise 23503 instead.
const RESTRICT_VIOLATION = '23001';
const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';

let database: Database;

// Builds the real DatabaseModule. Its init hook applies every migration, as a service start does.
async function startDatabaseModule(connectionUri: string): Promise<TestingModule> {
  const config = parseConfig(
    AuthServiceConfigSchema,
    authServiceEnvironment(TEST_KEYS, { AUTH_DATABASE_URL: connectionUri }),
  );
  const moduleRef = await Test.createTestingModule({
    imports: [ConfigModule.forRoot(config), DatabaseModule],
  }).compile();
  return moduleRef.init();
}

// Drizzle wraps the driver error, and the SQLSTATE is carried by the driver error it holds as cause.
function findSqlState(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  if ('code' in error && typeof error.code === 'string') return error.code;
  return findSqlState(error.cause);
}

async function sqlStateOf(statement: PromiseLike<unknown>): Promise<string> {
  try {
    await statement;
  } catch (error) {
    const sqlState = findSqlState(error);
    if (sqlState === undefined) throw error;
    return sqlState;
  }
  throw new Error('Expected the statement to fail, but it succeeded.');
}

function requireRow<TRow>(row: TRow | undefined): TRow {
  if (row === undefined) throw new Error('Expected a row, but the query returned none.');
  return row;
}

async function findRoleId(code: string): Promise<string> {
  const rows = await database.db
    .select({ id: masterRoles.id })
    .from(masterRoles)
    .where(eq(masterRoles.code, code));
  return requireRow(rows[0]).id;
}

async function insertRole(code: string, updatedAt?: Date): Promise<string> {
  const rows = await database.db
    .insert(masterRoles)
    .values({ code, name: `${code} role`, updatedAt })
    .returning({ id: masterRoles.id });
  return requireRow(rows[0]).id;
}

async function insertAccount(
  companyEmail: string,
  roleId: string,
  updatedAt?: Date,
): Promise<string> {
  const rows = await database.db
    .insert(accounts)
    .values({ companyEmail, passwordHash: PLACEHOLDER_PASSWORD_HASH, roleId, updatedAt })
    .returning({ id: accounts.id });
  return requireRow(rows[0]).id;
}

describe('auth schema', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let connectionUri: string;
  let moduleRef: TestingModule | undefined;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18').start();
    connectionUri = container.getConnectionUri();
    moduleRef = await startDatabaseModule(connectionUri);
    database = moduleRef.get<Database>(DATABASE);
  }, CONTAINER_TIMEOUT_MS);

  // Teardown still stops the container when setup failed partway through.
  afterAll(async () => {
    await moduleRef?.close();
    await container?.stop();
  }, CONTAINER_TIMEOUT_MS);

  it('should keep one EMPLOYEE and one HR role when migrations run again', async () => {
    const restarted = await startDatabaseModule(connectionUri);
    await restarted.close();

    const roles = await database.db
      .select({ code: masterRoles.code, name: masterRoles.name, isActive: masterRoles.isActive })
      .from(masterRoles)
      .where(inArray(masterRoles.code, ['EMPLOYEE', 'HR']))
      .orderBy(masterRoles.code);

    expect(roles).toEqual([
      { code: 'EMPLOYEE', name: 'Employee', isActive: true },
      { code: 'HR', name: 'HR', isActive: true },
    ]);
  });

  it('should reject a second account when its email differs only in letter case', async () => {
    const roleId = await findRoleId('EMPLOYEE');
    await insertAccount('nadia.rahma@dexa.test', roleId);

    const sqlState = await sqlStateOf(
      database.db.insert(accounts).values({
        companyEmail: 'NADIA.RAHMA@dexa.test',
        passwordHash: PLACEHOLDER_PASSWORD_HASH,
        roleId,
      }),
    );

    expect(sqlState).toBe(UNIQUE_VIOLATION);
  });

  it('should reject deleting a role when an account still references it', async () => {
    const roleId = await insertRole('RESTRICTED_ROLE');
    await insertAccount('restricted.holder@dexa.test', roleId);

    const sqlState = await sqlStateOf(
      database.db.delete(masterRoles).where(eq(masterRoles.id, roleId)),
    );

    expect(sqlState).toBe(RESTRICT_VIOLATION);
  });

  it('should default is_active to true when an account is created without it', async () => {
    const roleId = await findRoleId('EMPLOYEE');
    const accountId = await insertAccount('default.active@dexa.test', roleId);

    const rows = await database.db
      .select({ isActive: accounts.isActive })
      .from(accounts)
      .where(eq(accounts.id, accountId));

    expect(rows).toEqual([{ isActive: true }]);
  });

  it('should reject a role code that is not uppercase snake case when the code is hr-admin', async () => {
    const sqlState = await sqlStateOf(
      database.db.insert(masterRoles).values({ code: 'hr-admin', name: 'HR admin' }),
    );

    expect(sqlState).toBe(CHECK_VIOLATION);
  });

  it('should reject a role name that is blank when it contains only spaces', async () => {
    const sqlState = await sqlStateOf(
      database.db.insert(masterRoles).values({ code: 'BLANK_NAME_ROLE', name: '   ' }),
    );

    expect(sqlState).toBe(CHECK_VIOLATION);
  });

  it('should reject a provisioning operation when requested_role is ADMIN', async () => {
    const roleId = await findRoleId('HR');
    const actorAccountId = await insertAccount('hr.actor.for-admin-check@dexa.test', roleId);
    const accountId = await insertAccount('admin.candidate@dexa.test', roleId);

    const sqlState = await sqlStateOf(
      database.db.insert(accountProvisioningOperations).values({
        operationId: randomUUID(),
        accountId,
        actorAccountId,
        requestedEmail: 'admin.candidate@dexa.test',
        requestedRole: 'ADMIN',
        initialPasswordHash: PLACEHOLDER_PASSWORD_HASH,
        status: 'PENDING',
      }),
    );

    expect(sqlState).toBe(CHECK_VIOLATION);
  });

  it('should advance updated_at when a master role is updated', async () => {
    const roleId = await insertRole('UPDATED_ROLE', PAST_INSTANT);

    await database.db
      .update(masterRoles)
      .set({ name: 'Updated role' })
      .where(eq(masterRoles.id, roleId));

    const [role] = await database.db
      .select({ updatedAt: masterRoles.updatedAt })
      .from(masterRoles)
      .where(eq(masterRoles.id, roleId));
    expect(role?.updatedAt.getTime()).toBeGreaterThan(PAST_INSTANT.getTime());
  });

  it('should advance updated_at when an account is updated', async () => {
    const roleId = await findRoleId('EMPLOYEE');
    const accountId = await insertAccount('account.updated@dexa.test', roleId, PAST_INSTANT);

    await database.db.update(accounts).set({ isActive: false }).where(eq(accounts.id, accountId));

    const [account] = await database.db
      .select({ updatedAt: accounts.updatedAt })
      .from(accounts)
      .where(eq(accounts.id, accountId));
    expect(account?.updatedAt.getTime()).toBeGreaterThan(PAST_INSTANT.getTime());
  });

  it('should advance updated_at when a provisioning operation is updated', async () => {
    const roleId = await findRoleId('HR');
    const actorAccountId = await insertAccount('hr.actor.for-update@dexa.test', roleId);
    const accountId = await insertAccount('provisioned.update@dexa.test', roleId);
    const operationId = randomUUID();
    await database.db.insert(accountProvisioningOperations).values({
      operationId,
      accountId,
      actorAccountId,
      requestedEmail: 'provisioned.update@dexa.test',
      requestedRole: 'EMPLOYEE',
      initialPasswordHash: PLACEHOLDER_PASSWORD_HASH,
      status: 'PENDING',
      updatedAt: PAST_INSTANT,
    });

    await database.db
      .update(accountProvisioningOperations)
      .set({ status: 'ACTIVE' })
      .where(eq(accountProvisioningOperations.operationId, operationId));

    const [operation] = await database.db
      .select({ updatedAt: accountProvisioningOperations.updatedAt })
      .from(accountProvisioningOperations)
      .where(eq(accountProvisioningOperations.operationId, operationId));
    expect(operation?.updatedAt.getTime()).toBeGreaterThan(PAST_INSTANT.getTime());
  });
});
