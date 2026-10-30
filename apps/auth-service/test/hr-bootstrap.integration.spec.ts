import { ConflictError, parseConfig } from '@dexa/common';
import { Role } from '@dexa/contracts';
import { createDatabase, type Database } from '@dexa/db';
import type { LoggerService } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { inspect } from 'node:util';
import {
  ACCOUNT_REPOSITORY,
  type IAccountRepository,
} from '../src/accounts/account.repository.interface.js';
import { HrBootstrapService } from '../src/accounts/hr-bootstrap.service.js';
import { createAppModule } from '../src/app.module.js';
import { AuthServiceConfigSchema } from '../src/config/auth-service-config.schema.js';
import {
  PASSWORD_HASHER,
  type IPasswordHasher,
} from '../src/credentials/password-hasher.interface.js';
import { DATABASE } from '../src/infrastructure/db/database.token.js';
import { accounts, masterRoles } from '../src/infrastructure/db/schema.js';
import { authServiceEnvironment, generateAuthKeySet } from './auth-key-set.js';

// Starting the container pulls an image on a cold machine, which exceeds Jest's 5 second default.
const CONTAINER_TIMEOUT_MS = 120_000;
// Each test migrates a new database and hashes with argon2id, which can exceed Jest's default.
const TEST_TIMEOUT_MS = 30_000;
// Configured in mixed case, so the stored value also shows the lowercase normalization.
const CONFIGURED_EMAIL = 'HR.Admin@Dexa.Test';
const STORED_EMAIL = 'hr.admin@dexa.test';
const OTHER_EMAIL = 'other.admin@dexa.test';
const FIRST_PASSWORD = 'first-hr-pass-1';
const SECOND_PASSWORD = 'second-hr-pass-2';
// Stands in for an employee's stored hash. The test only reads it back and never verifies it.
const PLACEHOLDER_PASSWORD_HASH = '$argon2id$placeholder-not-a-real-hash';
const ARGON2ID_PREFIX = '$argon2id$';
// No other run holds this advisory lock during the test, so any key works.
const TEST_LOCK_KEY = 1;
// Generated once for the file. The config needs well-formed keys to pass validation.
const TEST_KEYS = generateAuthKeySet();

type BootstrapVariables = Record<string, string>;

type HrAccountRow = {
  readonly id: string;
  readonly companyEmail: string;
  readonly passwordHash: string;
  readonly isActive: boolean;
};

function bootstrapVariables(password: string, email = CONFIGURED_EMAIL): BootstrapVariables {
  return { AUTH_BOOTSTRAP_HR_EMAIL: email, AUTH_BOOTSTRAP_HR_PASSWORD: password };
}

// Each test gets an empty database, so no test can see accounts that another test created.
async function createEmptyDatabaseUri(serverUri: string): Promise<string> {
  const databaseName = `hr_bootstrap_${randomUUID().replaceAll('-', '')}`;
  const server = createDatabase(serverUri);
  try {
    await server.db.execute(sql`create database ${sql.identifier(databaseName)}`);
  } finally {
    await server.close();
  }
  const databaseUrl = new URL(serverUri);
  databaseUrl.pathname = `/${databaseName}`;
  return databaseUrl.toString();
}

// Records the warnings that the modules write. The testing module installs its logger when it
// compiles, so the recorder is attached through setLogger. A Jest spy is not used because the native
// ESM test setup does not provide the jest global.
function createWarningRecorder(warnings: string[]): LoggerService {
  return {
    log: () => undefined,
    error: () => undefined,
    warn: (message: string) => {
      warnings.push(message);
    },
    debug: () => undefined,
    verbose: () => undefined,
  };
}

function requireOnlyRow<TRow>(rows: ReadonlyArray<TRow>): TRow {
  const [row] = rows;
  if (rows.length !== 1 || row === undefined) {
    throw new Error(`Expected exactly one row, but the query returned ${rows.length}.`);
  }
  return row;
}

async function findHrAccounts(database: Database): Promise<HrAccountRow[]> {
  return database.db
    .select({
      id: accounts.id,
      companyEmail: accounts.companyEmail,
      passwordHash: accounts.passwordHash,
      isActive: accounts.isActive,
    })
    .from(accounts)
    .innerJoin(masterRoles, eq(accounts.roleId, masterRoles.id))
    .where(eq(masterRoles.code, Role.HR));
}

async function findAccountsByEmail(
  database: Database,
  companyEmail: string,
): Promise<Array<{ roleCode: string; passwordHash: string }>> {
  return database.db
    .select({ roleCode: masterRoles.code, passwordHash: accounts.passwordHash })
    .from(accounts)
    .innerJoin(masterRoles, eq(accounts.roleId, masterRoles.id))
    .where(eq(accounts.companyEmail, companyEmail));
}

async function findRoleId(database: Database, roleCode: Role): Promise<string> {
  const rows = await database.db
    .select({ id: masterRoles.id })
    .from(masterRoles)
    .where(eq(masterRoles.code, roleCode));
  return requireOnlyRow(rows).id;
}

describe('HR bootstrap', () => {
  let container: StartedPostgreSqlContainer;
  let openModules: TestingModule[] = [];
  let loggedWarnings: string[] = [];

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18').start();
  }, CONTAINER_TIMEOUT_MS);

  // Teardown still stops the container when setup failed partway through.
  afterAll(async () => {
    await container?.stop();
  }, CONTAINER_TIMEOUT_MS);

  beforeEach(() => {
    openModules = [];
    loggedWarnings = [];
  });

  afterEach(async () => {
    await Promise.all(openModules.map((moduleRef) => moduleRef.close()));
  });

  // Compiles the real root module with the config a service start would parse from its environment.
  async function compileAppModule(
    databaseUrl: string,
    variables: BootstrapVariables,
  ): Promise<TestingModule> {
    const config = parseConfig(
      AuthServiceConfigSchema,
      authServiceEnvironment(TEST_KEYS, { AUTH_DATABASE_URL: databaseUrl, ...variables }),
    );
    const moduleRef = await Test.createTestingModule({ imports: [createAppModule(config)] })
      .setLogger(createWarningRecorder(loggedWarnings))
      .compile();
    openModules.push(moduleRef);
    return moduleRef;
  }

  // Runs the lifecycle hooks the way a service start does: migrations first, then the bootstrap.
  async function startAppModule(
    databaseUrl: string,
    variables: BootstrapVariables,
  ): Promise<TestingModule> {
    const moduleRef = await compileAppModule(databaseUrl, variables);
    await moduleRef.init();
    return moduleRef;
  }

  it(
    'should create one active HR account whose argon2id hash verifies the configured password when no HR account exists',
    async () => {
      const databaseUrl = await createEmptyDatabaseUri(container.getConnectionUri());

      const moduleRef = await startAppModule(databaseUrl, bootstrapVariables(FIRST_PASSWORD));
      const hrAccount = requireOnlyRow(await findHrAccounts(moduleRef.get<Database>(DATABASE)));
      const hasher = moduleRef.get<IPasswordHasher>(PASSWORD_HASHER);

      expect(hrAccount).toMatchObject({ companyEmail: STORED_EMAIL, isActive: true });
      expect(hrAccount.passwordHash.startsWith(ARGON2ID_PREFIX)).toBe(true);
      await expect(hasher.verify(hrAccount.passwordHash, FIRST_PASSWORD)).resolves.toBe(true);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should keep the existing HR account unchanged when bootstrap runs again with other credentials',
    async () => {
      const databaseUrl = await createEmptyDatabaseUri(container.getConnectionUri());
      const firstStart = await startAppModule(databaseUrl, bootstrapVariables(FIRST_PASSWORD));
      const created = requireOnlyRow(await findHrAccounts(firstStart.get<Database>(DATABASE)));

      const restart = await startAppModule(
        databaseUrl,
        bootstrapVariables(SECOND_PASSWORD, OTHER_EMAIL),
      );
      const afterRestart = requireOnlyRow(await findHrAccounts(restart.get<Database>(DATABASE)));
      const hasher = restart.get<IPasswordHasher>(PASSWORD_HASHER);

      expect(afterRestart).toEqual(created);
      await expect(hasher.verify(afterRestart.passwordHash, FIRST_PASSWORD)).resolves.toBe(true);
      await expect(hasher.verify(afterRestart.passwordHash, SECOND_PASSWORD)).resolves.toBe(false);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should create exactly one HR account when two bootstrap runs execute concurrently',
    async () => {
      const databaseUrl = await createEmptyDatabaseUri(container.getConnectionUri());
      const moduleRef = await startAppModule(databaseUrl, bootstrapVariables(FIRST_PASSWORD));
      const database = moduleRef.get<Database>(DATABASE);
      // Deleting the account that the first start created leaves the state that two replicas
      // would both see.
      const hrAccount = requireOnlyRow(await findHrAccounts(database));
      await database.db.delete(accounts).where(eq(accounts.id, hrAccount.id));

      const bootstrap = moduleRef.get(HrBootstrapService);
      await Promise.all([bootstrap.onApplicationBootstrap(), bootstrap.onApplicationBootstrap()]);

      expect(await findHrAccounts(database)).toHaveLength(1);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should start and log a warning when no HR account exists and the bootstrap variables are unset',
    async () => {
      const databaseUrl = await createEmptyDatabaseUri(container.getConnectionUri());

      const moduleRef = await startAppModule(databaseUrl, {});

      expect(await findHrAccounts(moduleRef.get<Database>(DATABASE))).toEqual([]);
      expect(loggedWarnings).toEqual([expect.stringContaining('AUTH_BOOTSTRAP_HR_EMAIL')]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should not log a bootstrap warning when the bootstrap variables are unset and an HR account exists',
    async () => {
      const databaseUrl = await createEmptyDatabaseUri(container.getConnectionUri());
      await startAppModule(databaseUrl, bootstrapVariables(FIRST_PASSWORD));

      await startAppModule(databaseUrl, {});

      expect(loggedWarnings).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should reject startup and leave the employee account unchanged when the bootstrap email belongs to an EMPLOYEE account',
    async () => {
      const databaseUrl = await createEmptyDatabaseUri(container.getConnectionUri());
      // Starting without credentials migrates the database and creates no HR account.
      const preparedModule = await startAppModule(databaseUrl, {});
      const database = preparedModule.get<Database>(DATABASE);
      await database.db.insert(accounts).values({
        companyEmail: STORED_EMAIL,
        passwordHash: PLACEHOLDER_PASSWORD_HASH,
        roleId: await findRoleId(database, Role.EMPLOYEE),
      });

      const replica = await compileAppModule(databaseUrl, bootstrapVariables(FIRST_PASSWORD));
      const startupError = await replica.init().then(
        () => undefined,
        (error: unknown) => error,
      );

      expect(startupError).toBeInstanceOf(ConflictError);
      // Drizzle's own error message lists the bind parameters, which include the new password hash.
      expect(inspect(startupError)).not.toContain(ARGON2ID_PREFIX);
      expect(await findHrAccounts(database)).toEqual([]);
      expect(await findAccountsByEmail(database, STORED_EMAIL)).toEqual([
        { roleCode: Role.EMPLOYEE, passwordHash: PLACEHOLDER_PASSWORD_HASH },
      ]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should reject the write without exposing the password hash when the database rejects the account insert',
    async () => {
      const databaseUrl = await createEmptyDatabaseUri(container.getConnectionUri());
      const moduleRef = await startAppModule(databaseUrl, {});
      const accountRepository = moduleRef.get<IAccountRepository>(ACCOUNT_REPOSITORY);
      // A local part longer than the varchar(254) column makes the database reject the insert.
      const oversizedEmail = `${'a'.repeat(300)}@dexa.test`;

      const writeError = await accountRepository
        .runExclusiveTransaction(TEST_LOCK_KEY, (transaction) =>
          transaction.createAccount({
            companyEmail: oversizedEmail,
            passwordHash: PLACEHOLDER_PASSWORD_HASH,
            roleCode: Role.HR,
          }),
        )
        .then(
          () => undefined,
          (error: unknown) => error,
        );

      expect(writeError).toBeInstanceOf(Error);
      // Drizzle's own error message lists the bind parameters, which include the password hash.
      expect(inspect(writeError)).not.toContain(ARGON2ID_PREFIX);
      expect(await findHrAccounts(moduleRef.get<Database>(DATABASE))).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );
});
