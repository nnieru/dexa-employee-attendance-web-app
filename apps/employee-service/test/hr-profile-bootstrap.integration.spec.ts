import {
  ACCOUNT_STATUS_READER,
  DependencyUnavailableError,
  parseConfig,
  type IAccountStatusReader,
} from '@dexa/common';
import {
  ErrorCode,
  ProfileStatus,
  Role,
  type AccountLookupItem,
  type AccountReference,
  type AccountStatus,
} from '@dexa/contracts';
import { createDatabase, type Database } from '@dexa/db';
import type { LoggerService } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { inspect } from 'node:util';
import { createAppModule } from '../src/app.module.js';
import {
  AUTH_ACCOUNT_CLIENT,
  type IAuthAccountClient,
} from '../src/auth-accounts/auth-account-client.interface.js';
import {
  HR_BOOTSTRAP_RETRY_POLICY,
  type HrBootstrapRetryPolicy,
} from '../src/bootstrap/hr-bootstrap-retry-policy.interface.js';
import {
  HrProfileBootstrapService,
  type HrProfileBootstrapOutcome,
} from '../src/bootstrap/hr-profile-bootstrap.service.js';
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
const TEST_TIMEOUT_MS = 30_000;
const CONFIGURED_EMAIL = 'hr.admin@dexa.test';
const CONFIGURED_NAME = 'Sari Lestari';
const CHANGED_NAME = 'Sari Lestari Renamed';
// Seeded by the fixtures (config/master-data-fixtures.ts), which every start in this file uses.
const POSITION_CODE = 'HR_OFFICER';
const HR_ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
const HR_ACCOUNT: AccountReference = { id: HR_ACCOUNT_ID, role: Role.HR };
// Milliseconds, so the retries finish within the test timeout.
const TEST_RETRY_POLICY: HrBootstrapRetryPolicy = {
  initialDelayMilliseconds: 1,
  maxDelayMilliseconds: 4,
};

type BootstrapVariables = Record<string, string | undefined>;

type EmployeeRecord = {
  readonly accountId: string;
  readonly name: string;
  readonly positionCode: string;
  readonly employeeStatusCode: string;
  readonly profileStatus: string;
  readonly phoneNumber: string | null;
  readonly photoKey: string | null;
};

type AnswerLookup = (lookupNumber: number) => Promise<AccountReference | undefined>;

// Stands in for auth-service's by-email lookup. A test chooses each answer by the lookup's number, and can wait
// for a number of lookups without sleeping.
class FakeAuthAccountClient implements IAuthAccountClient {
  readonly lookedUpEmails: string[] = [];
  answerLookup: AnswerLookup = () => Promise.resolve(undefined);
  private waiters: Array<{ readonly count: number; readonly notify: () => void }> = [];

  get lookupCount(): number {
    return this.lookedUpEmails.length;
  }

  findAccountById(): Promise<AccountLookupItem | undefined> {
    return Promise.reject(new Error('The HR profile bootstrap looks up accounts by email only.'));
  }

  findAccountReferenceByEmail(email: string): Promise<AccountReference | undefined> {
    this.lookedUpEmails.push(email);
    this.waiters = this.waiters.filter((waiter) => {
      if (this.lookupCount < waiter.count) return true;
      waiter.notify();
      return false;
    });
    return this.answerLookup(this.lookupCount);
  }

  whenLookupCountReaches(count: number): Promise<void> {
    if (this.lookupCount >= count) return Promise.resolve();
    return new Promise((notify) => {
      this.waiters.push({ count, notify: () => notify() });
    });
  }
}

const fakeAccountStatusReader: IAccountStatusReader = {
  findAccountStatus: (): Promise<AccountStatus | undefined> => Promise.resolve(undefined),
};

function bootstrapVariables(overrides: BootstrapVariables = {}): BootstrapVariables {
  return {
    EMPLOYEE_BOOTSTRAP_HR_EMAIL: CONFIGURED_EMAIL,
    EMPLOYEE_BOOTSTRAP_HR_NAME: CONFIGURED_NAME,
    EMPLOYEE_BOOTSTRAP_HR_POSITION_CODE: POSITION_CODE,
    ...overrides,
  };
}

// Each test gets an empty database, so one test cannot see the profile that another test created.
async function createEmptyDatabaseUri(serverUri: string): Promise<string> {
  const databaseName = `hr_profile_bootstrap_${randomUUID().replaceAll('-', '')}`;
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

// Records every line the modules log, at any level, so a test can check what reached the log.
function createLogRecorder(lines: string[]): LoggerService {
  const record = (...args: unknown[]): void => {
    lines.push(inspect(args));
  };
  return { log: record, error: record, warn: record, debug: record, verbose: record };
}

async function findEmployeeRecords(database: Database): Promise<EmployeeRecord[]> {
  return database.db
    .select({
      accountId: employees.accountId,
      name: employees.name,
      positionCode: masterPositions.code,
      employeeStatusCode: masterEmployeeStatuses.code,
      profileStatus: employees.profileStatus,
      phoneNumber: employees.phoneNumber,
      photoKey: employees.photoKey,
    })
    .from(employees)
    .innerJoin(masterPositions, eq(employees.positionId, masterPositions.id))
    .innerJoin(masterEmployeeStatuses, eq(employees.employeeStatusId, masterEmployeeStatuses.id))
    .where(eq(employees.accountId, HR_ACCOUNT_ID));
}

describe('HR profile bootstrap', () => {
  let container: StartedPostgreSqlContainer;
  let auth: FakeAuthAccountClient;
  let openModules: TestingModule[] = [];
  let loggedLines: string[] = [];

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18').start();
  }, CONTAINER_TIMEOUT_MS);

  // Teardown still stops the container when setup failed partway through.
  afterAll(async () => {
    await container?.stop();
  }, CONTAINER_TIMEOUT_MS);

  beforeEach(() => {
    auth = new FakeAuthAccountClient();
    openModules = [];
    loggedLines = [];
  });

  afterEach(async () => {
    await Promise.all(openModules.map((moduleRef) => moduleRef.close()));
  });

  // Starts the real root module the way a service start does: migrations, master seed, then the bootstrap.
  // init resolves without waiting for the bootstrap attempts, which run in the background.
  async function startService(
    databaseUrl: string,
    variables: BootstrapVariables,
  ): Promise<TestingModule> {
    const config = parseConfig(
      EmployeeServiceConfigSchema,
      employeeServiceEnvironment({
        EMPLOYEE_DATABASE_URL: databaseUrl,
        EMPLOYEE_MASTER_DATA: 'fixtures',
        ...variables,
      }),
    );
    const moduleRef = await Test.createTestingModule({ imports: [createAppModule(config)] })
      .overrideProvider(ACCOUNT_STATUS_READER)
      .useValue(fakeAccountStatusReader)
      .overrideProvider(AUTH_ACCOUNT_CLIENT)
      .useValue(auth)
      .overrideProvider(HR_BOOTSTRAP_RETRY_POLICY)
      .useValue(TEST_RETRY_POLICY)
      .setLogger(createLogRecorder(loggedLines))
      .compile();
    openModules.push(moduleRef);
    await moduleRef.init();
    return moduleRef;
  }

  async function closeService(moduleRef: TestingModule): Promise<void> {
    openModules = openModules.filter((openModule) => openModule !== moduleRef);
    await moduleRef.close();
  }

  function requireOnlyRecord(records: ReadonlyArray<EmployeeRecord>): EmployeeRecord {
    const [record] = records;
    if (records.length !== 1 || record === undefined) {
      throw new Error(`Expected exactly one profile, but found ${records.length}.`);
    }
    return record;
  }

  function expectNoPersonalData(): void {
    const logText = loggedLines.join('\n');
    expect(logText).not.toContain(CONFIGURED_EMAIL);
    expect(logText).not.toContain(CONFIGURED_NAME);
  }

  it(
    'should create one ACTIVE profile with the configured name and position when the bootstrap HR account exists',
    async () => {
      const databaseUrl = await createEmptyDatabaseUri(container.getConnectionUri());
      auth.answerLookup = () => Promise.resolve(HR_ACCOUNT);

      const moduleRef = await startService(databaseUrl, bootstrapVariables());
      const outcome = await moduleRef.get(HrProfileBootstrapService).whenSettled();
      const record = requireOnlyRecord(
        await findEmployeeRecords(moduleRef.get<Database>(DATABASE)),
      );

      expect(outcome).toBe('CREATED');
      expect(auth.lookedUpEmails).toEqual([CONFIGURED_EMAIL]);
      expect(record).toEqual({
        accountId: HR_ACCOUNT_ID,
        name: CONFIGURED_NAME,
        positionCode: POSITION_CODE,
        employeeStatusCode: 'ACTIVE',
        profileStatus: ProfileStatus.INCOMPLETE,
        phoneNumber: null,
        photoKey: null,
      });
      expectNoPersonalData();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should keep the existing profile unchanged when the bootstrap runs again with another name',
    async () => {
      const databaseUrl = await createEmptyDatabaseUri(container.getConnectionUri());
      auth.answerLookup = () => Promise.resolve(HR_ACCOUNT);
      const firstStart = await startService(databaseUrl, bootstrapVariables());
      await firstStart.get(HrProfileBootstrapService).whenSettled();
      await closeService(firstStart);

      const restart = await startService(
        databaseUrl,
        bootstrapVariables({ EMPLOYEE_BOOTSTRAP_HR_NAME: CHANGED_NAME }),
      );
      const outcome = await restart.get(HrProfileBootstrapService).whenSettled();
      const record = requireOnlyRecord(await findEmployeeRecords(restart.get<Database>(DATABASE)));

      expect(outcome).toBe('ALREADY_PRESENT');
      expect(record.name).toBe(CONFIGURED_NAME);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should finish startup before the profile exists and create it after the lookups find the account',
    async () => {
      const databaseUrl = await createEmptyDatabaseUri(container.getConnectionUri());
      let isAccountRegistered = false;
      auth.answerLookup = () => Promise.resolve(isAccountRegistered ? HR_ACCOUNT : undefined);

      const moduleRef = await startService(databaseUrl, bootstrapVariables());
      await auth.whenLookupCountReaches(2);
      const recordsWhileRetrying = await findEmployeeRecords(moduleRef.get<Database>(DATABASE));
      isAccountRegistered = true;
      const outcome = await moduleRef.get(HrProfileBootstrapService).whenSettled();
      const record = requireOnlyRecord(
        await findEmployeeRecords(moduleRef.get<Database>(DATABASE)),
      );

      expect(recordsWhileRetrying).toHaveLength(0);
      expect(auth.lookupCount).toBeGreaterThanOrEqual(3);
      expect(outcome).toBe('CREATED');
      expect(record.employeeStatusCode).toBe('ACTIVE');
      expectNoPersonalData();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should create the profile when Auth is unavailable for the first lookups and then recovers',
    async () => {
      const databaseUrl = await createEmptyDatabaseUri(container.getConnectionUri());
      auth.answerLookup = (lookupNumber) =>
        lookupNumber <= 2
          ? Promise.reject(
              new DependencyUnavailableError(
                ErrorCode.DEPENDENCY_UNAVAILABLE,
                'Auth is unavailable.',
              ),
            )
          : Promise.resolve(HR_ACCOUNT);

      const moduleRef = await startService(databaseUrl, bootstrapVariables());
      const outcome = await moduleRef.get(HrProfileBootstrapService).whenSettled();
      const record = requireOnlyRecord(
        await findEmployeeRecords(moduleRef.get<Database>(DATABASE)),
      );

      expect(outcome).toBe('CREATED');
      expect(auth.lookupCount).toBe(3);
      expect(record.accountId).toBe(HR_ACCOUNT_ID);
      expect(loggedLines.some((line) => line.includes(ErrorCode.DEPENDENCY_UNAVAILABLE))).toBe(
        true,
      );
      expectNoPersonalData();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should create no profile and stop after one lookup when the bootstrap email has a role other than HR',
    async () => {
      const databaseUrl = await createEmptyDatabaseUri(container.getConnectionUri());
      auth.answerLookup = () => Promise.resolve({ id: HR_ACCOUNT_ID, role: Role.EMPLOYEE });

      const moduleRef = await startService(databaseUrl, bootstrapVariables());
      const outcome = await moduleRef.get(HrProfileBootstrapService).whenSettled();
      const records = await findEmployeeRecords(moduleRef.get<Database>(DATABASE));

      expect(outcome).toBe('CONFIGURATION_REJECTED');
      expect(auth.lookupCount).toBe(1);
      expect(records).toHaveLength(0);
      expect(loggedLines.some((line) => line.includes('does not have the HR role'))).toBe(true);
      expectNoPersonalData();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should create no profile and stop after one lookup when the position code names no active position',
    async () => {
      const databaseUrl = await createEmptyDatabaseUri(container.getConnectionUri());
      auth.answerLookup = () => Promise.resolve(HR_ACCOUNT);

      const moduleRef = await startService(
        databaseUrl,
        bootstrapVariables({ EMPLOYEE_BOOTSTRAP_HR_POSITION_CODE: 'NO_SUCH_POSITION' }),
      );
      const outcome = await moduleRef.get(HrProfileBootstrapService).whenSettled();
      const records = await findEmployeeRecords(moduleRef.get<Database>(DATABASE));

      expect(outcome).toBe('CONFIGURATION_REJECTED');
      expect(auth.lookupCount).toBe(1);
      expect(records).toHaveLength(0);
      expect(loggedLines.some((line) => line.includes('does not match an active position'))).toBe(
        true,
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should do nothing and make no lookup when the bootstrap HR settings are not configured',
    async () => {
      const databaseUrl = await createEmptyDatabaseUri(container.getConnectionUri());

      const moduleRef = await startService(databaseUrl, {});
      const outcome: HrProfileBootstrapOutcome = await moduleRef
        .get(HrProfileBootstrapService)
        .whenSettled();
      const records = await findEmployeeRecords(moduleRef.get<Database>(DATABASE));

      expect(outcome).toBe('NOT_CONFIGURED');
      expect(auth.lookupCount).toBe(0);
      expect(records).toHaveLength(0);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should stop retrying and make no further lookup when the app shuts down during the retries',
    async () => {
      const databaseUrl = await createEmptyDatabaseUri(container.getConnectionUri());
      // No account exists yet, so the attempts keep retrying until the shutdown stops them.
      const moduleRef = await startService(databaseUrl, bootstrapVariables());
      const service = moduleRef.get(HrProfileBootstrapService);
      await auth.whenLookupCountReaches(2);

      await closeService(moduleRef);
      const lookupCountAtClose = auth.lookupCount;
      const outcome = await service.whenSettled();

      expect(outcome).toBe('STOPPED');
      expect(lookupCountAtClose).toBeGreaterThanOrEqual(2);
      expect(auth.lookupCount).toBe(lookupCountAtClose);
    },
    TEST_TIMEOUT_MS,
  );
});
