import { parseConfig } from '@dexa/common';
import { createDatabase, type Database } from '@dexa/db';
import type { LoggerService } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createAppModule } from '../src/app.module.js';
import { EmployeeServiceConfigSchema } from '../src/config/employee-service-config.schema.js';
import { DATABASE } from '../src/infrastructure/db/database.token.js';
import {
  employees,
  masterEmployeeStatuses,
  masterPositions,
} from '../src/infrastructure/db/schema.js';
import { employeeServiceEnvironment } from './employee-service-environment.js';

// Starting the container pulls an image on a cold machine, which exceeds Jest's 5 second default.
const CONTAINER_TIMEOUT_MS = 120_000;
// Each test migrates a new database and starts the application, which can exceed Jest's default.
const TEST_TIMEOUT_MS = 30_000;

// ON DELETE RESTRICT raises restrict_violation. ON DELETE NO ACTION would raise 23503 instead.
const RESTRICT_VIOLATION = '23001';
const NOT_NULL_VIOLATION = '23502';
const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';

const PAST_INSTANT = new Date('2000-01-01T00:00:00.000Z');

const SEED_DOCUMENT = {
  positions: [
    { code: 'FULLSTACK_DEVELOPER', name: 'Fullstack Developer' },
    { code: 'HR_OFFICER', name: 'HR Officer' },
  ],
  employeeStatuses: [
    { code: 'ACTIVE', name: 'Active' },
    { code: 'INACTIVE', name: 'Inactive' },
  ],
};
const SEED_SETTING = JSON.stringify(SEED_DOCUMENT);

// Same codes as SEED_DOCUMENT with a new label, a new position, and no change to the statuses.
const RELABELED_SETTING = JSON.stringify({
  positions: [
    { code: 'FULLSTACK_DEVELOPER', name: 'Relabeled Developer' },
    { code: 'HR_OFFICER', name: 'Relabeled HR' },
    { code: 'DATA_ANALYST', name: 'Data Analyst' },
  ],
  employeeStatuses: SEED_DOCUMENT.employeeStatuses,
});

type DatabaseFailure = {
  readonly sqlState: string;
  readonly constraint: string | undefined;
};

type EmployeeInsert = typeof employees.$inferInsert;

let container: StartedPostgreSqlContainer;
let openModules: TestingModule[] = [];
let loggedWarnings: string[] = [];

// Each test gets an empty database, so no test can see rows that another test created.
async function createEmptyDatabaseUri(serverUri: string): Promise<string> {
  const databaseName = `employee_schema_${randomUUID().replaceAll('-', '')}`;
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

// The testing module installs its logger when it compiles, so the recorder is attached through
// setLogger. Only warnings are kept, because they are what the startup behavior promises.
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

// Compiles the real root module from the environment a service start would parse. Nest runs the
// migrations and the seed when the module initializes.
async function compileApp(databaseUrl: string, masterDataSetting?: string): Promise<TestingModule> {
  const config = parseConfig(
    EmployeeServiceConfigSchema,
    employeeServiceEnvironment({
      EMPLOYEE_DATABASE_URL: databaseUrl,
      EMPLOYEE_MASTER_DATA: masterDataSetting,
    }),
  );
  const moduleRef = await Test.createTestingModule({ imports: [createAppModule(config)] })
    .setLogger(createWarningRecorder(loggedWarnings))
    .compile();
  openModules.push(moduleRef);
  return moduleRef;
}

async function startApp(databaseUrl: string, masterDataSetting?: string): Promise<TestingModule> {
  const moduleRef = await compileApp(databaseUrl, masterDataSetting);
  await moduleRef.init();
  return moduleRef;
}

// Drizzle wraps the driver error. The SQLSTATE and constraint name are on the driver error held as cause.
function findDatabaseFailure(error: unknown): DatabaseFailure | undefined {
  if (!(error instanceof Error)) return undefined;
  if ('code' in error && typeof error.code === 'string') {
    const constraint =
      'constraint' in error && typeof error.constraint === 'string' ? error.constraint : undefined;
    return { sqlState: error.code, constraint };
  }
  return findDatabaseFailure(error.cause);
}

async function failureOf(statement: PromiseLike<unknown>): Promise<DatabaseFailure> {
  try {
    await statement;
  } catch (error) {
    const failure = findDatabaseFailure(error);
    if (failure === undefined) throw error;
    return failure;
  }
  throw new Error('Expected the statement to fail, but it succeeded.');
}

function requireRow<TRow>(row: TRow | undefined): TRow {
  if (row === undefined) throw new Error('Expected a row, but the query returned none.');
  return row;
}

async function positionIdOf(database: Database, code: string): Promise<string> {
  const rows = await database.db
    .select({ id: masterPositions.id })
    .from(masterPositions)
    .where(eq(masterPositions.code, code));
  return requireRow(rows[0]).id;
}

async function employeeStatusIdOf(database: Database, code: string): Promise<string> {
  const rows = await database.db
    .select({ id: masterEmployeeStatuses.id })
    .from(masterEmployeeStatuses)
    .where(eq(masterEmployeeStatuses.code, code));
  return requireRow(rows[0]).id;
}

async function setPositionActive(
  database: Database,
  code: string,
  isActive: boolean,
): Promise<void> {
  await database.db.update(masterPositions).set({ isActive }).where(eq(masterPositions.code, code));
}

async function setEmployeeStatusActive(
  database: Database,
  code: string,
  isActive: boolean,
): Promise<void> {
  await database.db
    .update(masterEmployeeStatuses)
    .set({ isActive })
    .where(eq(masterEmployeeStatuses.code, code));
}

// A complete set of required values: an active position, an active ACTIVE status, and a fresh account.
async function employeeValues(
  database: Database,
  overrides: Partial<EmployeeInsert> = {},
): Promise<EmployeeInsert> {
  return {
    accountId: randomUUID(),
    name: 'Ada Lovelace',
    positionId: await positionIdOf(database, 'FULLSTACK_DEVELOPER'),
    employeeStatusId: await employeeStatusIdOf(database, 'ACTIVE'),
    profileStatus: 'INCOMPLETE',
    ...overrides,
  };
}

async function insertEmployee(
  database: Database,
  overrides: Partial<EmployeeInsert> = {},
): Promise<string> {
  const values = await employeeValues(database, overrides);
  await database.db.insert(employees).values(values);
  return values.accountId;
}

async function startAppWithSeed(): Promise<{ databaseUrl: string; database: Database }> {
  const databaseUrl = await createEmptyDatabaseUri(container.getConnectionUri());
  const moduleRef = await startApp(databaseUrl, SEED_SETTING);
  return { databaseUrl, database: moduleRef.get<Database>(DATABASE) };
}

describe('employee schema and master seed', () => {
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

  describe('migrations and master seed', () => {
    it(
      'should create the employee tables when the migrations run on a fresh database',
      async () => {
        const databaseUrl = await createEmptyDatabaseUri(container.getConnectionUri());
        const moduleRef = await startApp(databaseUrl);

        const result = await moduleRef
          .get<Database>(DATABASE)
          .db.execute<{ table_name: string }>(
            sql`select table_name from information_schema.tables where table_schema = 'public'`,
          );

        expect(result.rows.map((row) => row.table_name)).toEqual(
          expect.arrayContaining([
            'employee_provisioning_operations',
            'employees',
            'master_employee_statuses',
            'master_positions',
          ]),
        );
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should insert the configured positions and employee statuses when the seed setting is JSON',
      async () => {
        const { database } = await startAppWithSeed();

        const positions = await database.db
          .select({
            code: masterPositions.code,
            name: masterPositions.name,
            isActive: masterPositions.isActive,
          })
          .from(masterPositions)
          .orderBy(masterPositions.code);
        const statuses = await database.db
          .select({
            code: masterEmployeeStatuses.code,
            name: masterEmployeeStatuses.name,
            isActive: masterEmployeeStatuses.isActive,
          })
          .from(masterEmployeeStatuses)
          .orderBy(masterEmployeeStatuses.code);

        expect(positions).toEqual([
          { code: 'FULLSTACK_DEVELOPER', name: 'Fullstack Developer', isActive: true },
          { code: 'HR_OFFICER', name: 'HR Officer', isActive: true },
        ]);
        expect(statuses).toEqual([
          { code: 'ACTIVE', name: 'Active', isActive: true },
          { code: 'INACTIVE', name: 'Inactive', isActive: true },
        ]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should leave existing master rows unchanged when the application restarts with new labels and a deactivated position',
      async () => {
        const { databaseUrl, database } = await startAppWithSeed();
        await setPositionActive(database, 'HR_OFFICER', false);

        const restart = await startApp(databaseUrl, RELABELED_SETTING);
        const afterRestart = await restart
          .get<Database>(DATABASE)
          .db.select({
            code: masterPositions.code,
            name: masterPositions.name,
            isActive: masterPositions.isActive,
          })
          .from(masterPositions)
          .orderBy(masterPositions.code);

        expect(afterRestart).toEqual([
          { code: 'DATA_ANALYST', name: 'Data Analyst', isActive: true },
          { code: 'FULLSTACK_DEVELOPER', name: 'Fullstack Developer', isActive: true },
          { code: 'HR_OFFICER', name: 'HR Officer', isActive: false },
        ]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should seed nothing and log a warning when the seed setting is unset and the master tables are empty',
      async () => {
        const databaseUrl = await createEmptyDatabaseUri(container.getConnectionUri());

        const moduleRef = await startApp(databaseUrl);

        const positions = await moduleRef
          .get<Database>(DATABASE)
          .db.select({ id: masterPositions.id })
          .from(masterPositions);
        expect(positions).toEqual([]);
        expect(loggedWarnings).toEqual([expect.stringContaining('EMPLOYEE_MASTER_DATA')]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should not log a master data warning when the seed setting is unset and the master tables already hold rows',
      async () => {
        const { databaseUrl } = await startAppWithSeed();
        loggedWarnings = [];

        await startApp(databaseUrl);

        expect(loggedWarnings).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('assignment of inactive masters', () => {
    it(
      'should reject a new employee whose position is inactive when the position active constraint is checked',
      async () => {
        const { database } = await startAppWithSeed();
        await setPositionActive(database, 'HR_OFFICER', false);

        const failure = await failureOf(
          database.db.insert(employees).values(
            await employeeValues(database, {
              positionId: await positionIdOf(database, 'HR_OFFICER'),
            }),
          ),
        );

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'employees_position_id_active_ck',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should accept an update to an unrelated employee field while the assigned position is inactive',
      async () => {
        const { database } = await startAppWithSeed();
        const accountId = await insertEmployee(database);
        await setPositionActive(database, 'FULLSTACK_DEVELOPER', false);

        const [updated] = await database.db
          .update(employees)
          .set({ name: 'Grace Hopper' })
          .where(eq(employees.accountId, accountId))
          .returning({ name: employees.name });

        expect(updated).toEqual({ name: 'Grace Hopper' });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reject a change of employee status to an inactive status when the status active constraint is checked',
      async () => {
        const { database } = await startAppWithSeed();
        const accountId = await insertEmployee(database);
        await setEmployeeStatusActive(database, 'INACTIVE', false);

        const failure = await failureOf(
          database.db
            .update(employees)
            .set({ employeeStatusId: await employeeStatusIdOf(database, 'INACTIVE') })
            .where(eq(employees.accountId, accountId)),
        );

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'employees_employee_status_id_active_ck',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should keep an existing inactive status reference valid when the status is deactivated afterwards',
      async () => {
        const { database } = await startAppWithSeed();
        const accountId = await insertEmployee(database, {
          employeeStatusId: await employeeStatusIdOf(database, 'INACTIVE'),
        });
        await setEmployeeStatusActive(database, 'INACTIVE', false);

        const [updated] = await database.db
          .update(employees)
          .set({ name: 'Grace Hopper' })
          .where(eq(employees.accountId, accountId))
          .returning({ name: employees.name });

        expect(updated).toEqual({ name: 'Grace Hopper' });
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('employee profile checks', () => {
    it.each(['+6281234567890', '0812345678'])(
      'should accept the phone number %s',
      async (phoneNumber) => {
        const { database } = await startAppWithSeed();

        const accountId = await insertEmployee(database, { phoneNumber });

        const [row] = await database.db
          .select({ phoneNumber: employees.phoneNumber })
          .from(employees)
          .where(eq(employees.accountId, accountId));
        expect(row).toEqual({ phoneNumber });
      },
      TEST_TIMEOUT_MS,
    );

    it.each([
      { phoneNumber: 'abc', reason: 'letters' },
      { phoneNumber: '+12', reason: 'fewer than 8 digits' },
      { phoneNumber: '1234567890123456', reason: 'more than 15 digits' },
      { phoneNumber: ' 0812345678', reason: 'leading whitespace' },
    ])(
      'should reject a phone number with $reason',
      async ({ phoneNumber }) => {
        const { database } = await startAppWithSeed();

        const failure = await failureOf(
          database.db.insert(employees).values(await employeeValues(database, { phoneNumber })),
        );

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'employees_phone_number_ck',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reject a COMPLETE profile without a photo reference',
      async () => {
        const { database } = await startAppWithSeed();

        const failure = await failureOf(
          database.db.insert(employees).values(
            await employeeValues(database, {
              profileStatus: 'COMPLETE',
              phoneNumber: '+6281234567890',
            }),
          ),
        );

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'employees_profile_status_completion_ck',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reject an INCOMPLETE profile that already has a phone number and a photo reference',
      async () => {
        const { database } = await startAppWithSeed();

        const failure = await failureOf(
          database.db.insert(employees).values(
            await employeeValues(database, {
              profileStatus: 'INCOMPLETE',
              phoneNumber: '+6281234567890',
              photoKey: `${randomUUID()}.jpg`,
            }),
          ),
        );

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'employees_profile_status_completion_ck',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should accept a COMPLETE profile with a phone number and a photo reference',
      async () => {
        const { database } = await startAppWithSeed();

        const accountId = await insertEmployee(database, {
          profileStatus: 'COMPLETE',
          phoneNumber: '+6281234567890',
          photoKey: `${randomUUID()}.jpg`,
        });

        const [row] = await database.db
          .select({ profileStatus: employees.profileStatus })
          .from(employees)
          .where(eq(employees.accountId, accountId));
        expect(row).toEqual({ profileStatus: 'COMPLETE' });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reject a profile status other than INCOMPLETE or COMPLETE',
      async () => {
        const { database } = await startAppWithSeed();

        const failure = await failureOf(
          database.db
            .insert(employees)
            .values(await employeeValues(database, { profileStatus: 'PENDING' })),
        );

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'employees_profile_status_ck',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reject an employee insert that omits profile_status because the column has no default',
      async () => {
        const { database } = await startAppWithSeed();

        const failure = await failureOf(
          database.db.execute(
            sql`insert into "employees" ("account_id", "name", "position_id", "employee_status_id")
              values (${randomUUID()}, 'Ada Lovelace', ${await positionIdOf(database, 'FULLSTACK_DEVELOPER')}, ${await employeeStatusIdOf(database, 'ACTIVE')})`,
          ),
        );

        expect(failure.sqlState).toBe(NOT_NULL_VIOLATION);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reject a blank employee name when the name contains only spaces',
      async () => {
        const { database } = await startAppWithSeed();

        const failure = await failureOf(
          database.db.insert(employees).values(await employeeValues(database, { name: '   ' })),
        );

        expect(failure).toEqual({ sqlState: CHECK_VIOLATION, constraint: 'employees_name_ck' });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should set updated_at from the database clock when an employee row is updated',
      async () => {
        const { database } = await startAppWithSeed();
        const accountId = await insertEmployee(database, { updatedAt: PAST_INSTANT });

        await database.db
          .update(employees)
          .set({ name: 'Grace Hopper' })
          .where(eq(employees.accountId, accountId));

        const [row] = await database.db
          .select({ updatedAt: employees.updatedAt })
          .from(employees)
          .where(eq(employees.accountId, accountId));
        expect(requireRow(row).updatedAt.getTime()).toBeGreaterThan(PAST_INSTANT.getTime());
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('master tables', () => {
    it(
      'should reject deleting a position that an employee references',
      async () => {
        const { database } = await startAppWithSeed();
        await insertEmployee(database);

        const failure = await failureOf(
          database.db
            .delete(masterPositions)
            .where(eq(masterPositions.code, 'FULLSTACK_DEVELOPER')),
        );

        expect(failure).toEqual({
          sqlState: RESTRICT_VIOLATION,
          constraint: 'employees_position_id_fk',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reject a position code that is not uppercase snake case',
      async () => {
        const { database } = await startAppWithSeed();

        const failure = await failureOf(
          database.db.insert(masterPositions).values({ code: 'hr-officer', name: 'HR officer' }),
        );

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'master_positions_code_ck',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reject an employee status code that is not uppercase snake case',
      async () => {
        const { database } = await startAppWithSeed();

        const failure = await failureOf(
          database.db.insert(masterEmployeeStatuses).values({ code: 'on leave', name: 'On leave' }),
        );

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'master_employee_statuses_code_ck',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reject a duplicate position code',
      async () => {
        const { database } = await startAppWithSeed();

        const failure = await failureOf(
          database.db
            .insert(masterPositions)
            .values({ code: 'FULLSTACK_DEVELOPER', name: 'Another label' }),
        );

        expect(failure).toEqual({
          sqlState: UNIQUE_VIOLATION,
          constraint: 'master_positions_code_uq',
        });
      },
      TEST_TIMEOUT_MS,
    );
  });
});
