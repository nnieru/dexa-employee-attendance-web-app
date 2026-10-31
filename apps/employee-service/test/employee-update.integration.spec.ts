import { randomUUID } from 'node:crypto';
import { inspect } from 'node:util';
import {
  ConflictError,
  DependencyUnavailableError,
  configureApp,
  parseConfig,
  ServiceName,
} from '@dexa/common';
import {
  employeeDetailSchema,
  ErrorCode,
  ProfileStatus,
  Role,
  type AccountLookupItem,
  type AccountStatus,
} from '@dexa/contracts';
import type { Database } from '@dexa/db';
import type { INestApplication, LoggerService } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { createAppModule } from '../src/app.module.js';
import {
  AUTH_ACCOUNT_CLIENT,
  type IAuthAccountClient,
} from '../src/auth-accounts/auth-account-client.interface.js';
import {
  AUTH_ACCOUNT_ADMINISTRATION_CLIENT,
  type IAuthAccountAdministrationClient,
} from '../src/auth-accounts/auth-account-administration-client.interface.js';
import { EmployeeServiceConfigSchema } from '../src/config/employee-service-config.schema.js';
import { EmployeeDetailRepository } from '../src/employees/employee-detail.repository.js';
import {
  EMPLOYEE_DETAIL_READER,
  type EmployeeDetailRecord,
  type IEmployeeDetailReader,
} from '../src/employees/employee-detail.reader.interface.js';
import {
  EMPLOYEE_UPDATE_SERVICE,
  type IEmployeeUpdateService,
} from '../src/employees/employee-update.service.interface.js';
import { DATABASE } from '../src/infrastructure/db/database.token.js';
import {
  employees,
  masterEmployeeStatuses,
  masterPositions,
} from '../src/infrastructure/db/schema.js';
import {
  MASTER_ASSIGNMENT_READER,
  type IMasterAssignmentReader,
  type MasterEmployeeStatusOption,
  type MasterPositionOption,
} from '../src/masters/master-assignment.reader.interface.js';
import { MasterAssignmentRepository } from '../src/masters/master-assignment.repository.js';
import type { AuthKeySet } from './auth-key-set.js';
import { signGatewayUserToken } from './gateway-user-token.js';
import {
  employeeServiceAuthKeys,
  employeeServiceEnvironment,
} from './employee-service-environment.js';

// Starting the container pulls an image on a cold machine, which exceeds Jest's 5 second default.
const CONTAINER_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 30_000;
const PHOTO_KEY = '3f1b2c4d-0a9e-4b8f-8c7d-6e5f4a3b2c1d.jpg';
const PHONE = '+6281234567890';
const OTHER_PHONE = '+6289876543210';
const RESET_PASSWORD = 'Reset-Secret-2';
const SEED_DOCUMENT = {
  positions: [
    { code: 'HR_OFFICER', name: 'HR Officer' },
    { code: 'FULLSTACK_DEVELOPER', name: 'Fullstack Developer' },
    { code: 'DATA_ANALYST', name: 'Data Analyst' },
  ],
  employeeStatuses: [
    { code: 'ACTIVE', name: 'Active' },
    { code: 'INACTIVE', name: 'Inactive' },
    { code: 'ON_LEAVE', name: 'On leave' },
  ],
};

type AuthOutage = 'NONE' | 'BEFORE_CHANGE' | 'AFTER_CHANGE';

// What the fake records for each call. localStatusCode is the stored status when Auth was called.
type AdministrationCall =
  | {
      readonly kind: 'ACTIVE_STATUS';
      readonly accountId: string;
      readonly actorAccountId: string;
      readonly isActive: boolean;
      readonly localStatusCode: string | undefined;
    }
  | {
      readonly kind: 'PASSWORD_RESET';
      readonly accountId: string;
      readonly actorAccountId: string;
      readonly newPassword: string;
    };

function unavailableError(): DependencyUnavailableError {
  return new DependencyUnavailableError(ErrorCode.DEPENDENCY_UNAVAILABLE, 'Auth is unavailable.');
}

// Stands in for the HR routes of auth-service. It follows the real rules: an HR account cannot deactivate itself
// (409). An outage is either before the change, so it is not applied, or after it, so the change applied and the
// answer was lost. Each call records the stored local status, so a test can check the order of the two writes.
class FakeAuthAdministration implements IAuthAccountAdministrationClient {
  readonly calls: AdministrationCall[] = [];
  // The active flag that Auth holds for each account, set only once a change has applied.
  readonly activeFlags = new Map<string, boolean>();
  outage: { readonly activeStatus: AuthOutage; readonly passwordReset: AuthOutage } = {
    activeStatus: 'NONE',
    passwordReset: 'NONE',
  };

  constructor(
    private readonly readLocalStatusCode: (accountId: string) => Promise<string | undefined>,
  ) {}

  reset(): void {
    this.calls.length = 0;
    this.activeFlags.clear();
    this.outage = { activeStatus: 'NONE', passwordReset: 'NONE' };
  }

  async setActiveStatus(
    accountId: string,
    input: { readonly actorAccountId: string; readonly isActive: boolean },
  ): Promise<AccountStatus> {
    this.calls.push({
      kind: 'ACTIVE_STATUS',
      accountId,
      actorAccountId: input.actorAccountId,
      isActive: input.isActive,
      localStatusCode: await this.readLocalStatusCode(accountId),
    });
    if (this.outage.activeStatus === 'BEFORE_CHANGE') throw unavailableError();
    if (!input.isActive && input.actorAccountId === accountId) {
      throw new ConflictError(
        ErrorCode.CONFLICT,
        'An HR account cannot deactivate its own account.',
      );
    }
    this.activeFlags.set(accountId, input.isActive);
    if (this.outage.activeStatus === 'AFTER_CHANGE') throw unavailableError();
    return { isActive: input.isActive };
  }

  resetPassword(
    accountId: string,
    input: { readonly actorAccountId: string; readonly newPassword: string },
  ): Promise<void> {
    this.calls.push({
      kind: 'PASSWORD_RESET',
      accountId,
      actorAccountId: input.actorAccountId,
      newPassword: input.newPassword,
    });
    if (this.outage.passwordReset === 'BEFORE_CHANGE') return Promise.reject(unavailableError());
    if (this.outage.passwordReset === 'AFTER_CHANGE') return Promise.reject(unavailableError());
    return Promise.resolve();
  }
}

// Auth's identity lookup answers for deactivated accounts too, so the update's response can still name them.
const accountDirectory = new Map<string, AccountLookupItem>();
const fakeAuthAccountClient: IAuthAccountClient = {
  findAccountById: (accountId) => Promise.resolve(accountDirectory.get(accountId)),
  lookupAccounts: (accountIds) =>
    Promise.resolve(accountIds.flatMap((accountId) => accountDirectory.get(accountId) ?? [])),
  searchAccountIdsByEmail: () => Promise.reject(new Error('These specs do not search accounts.')),
  findAccountReferenceByEmail: () => Promise.resolve(undefined),
};

// Wraps the real master reader. With trustAll set, it reports every option as active, as if HR had deactivated
// the option after the pre-check. The database rule must then refuse the write.
class MasterReaderOverride implements IMasterAssignmentReader {
  trustAll = false;

  constructor(private readonly real: IMasterAssignmentReader) {}

  async findPositionOption(positionId: string): Promise<MasterPositionOption> {
    const option = await this.real.findPositionOption(positionId);
    if (!this.trustAll || option === undefined) return option;
    return { isActive: true };
  }

  async findEmployeeStatusOption(employeeStatusId: string): Promise<MasterEmployeeStatusOption> {
    const option = await this.real.findEmployeeStatusOption(employeeStatusId);
    if (!this.trustAll || option === undefined) return option;
    return { code: option.code, isActive: true };
  }
}

// Wraps the real detail reader. When a stale status is set, the next read (the update's snapshot) shows that status, as
// if it had been read before a concurrent change. The lock still reads the stored row. The override is consumed by that
// one read, so the response read afterwards shows the stored row.
class DetailReaderOverride implements IEmployeeDetailReader {
  staleStatus:
    | { readonly accountId: string; readonly status: EmployeeDetailRecord['employeeStatus'] }
    | undefined;

  constructor(private readonly real: IEmployeeDetailReader) {}

  async findEmployeeDetail(accountId: string): Promise<EmployeeDetailRecord | undefined> {
    const record = await this.real.findEmployeeDetail(accountId);
    const stale = this.staleStatus;
    if (record === undefined || stale?.accountId !== accountId) return record;
    this.staleStatus = undefined;
    return { ...record, employeeStatus: stale.status };
  }
}

// Signs the token that api-gateway sends to this service for the user (D-51).
function signUserToken(keys: AuthKeySet, accountId: string, role: Role): string {
  return signGatewayUserToken(keys, ServiceName.EMPLOYEE_SERVICE, accountId, role);
}

// Records every line that the modules log, so a test can check that no password reached the log.
function createLogRecorder(lines: string[]): LoggerService {
  const record = (...args: unknown[]): void => {
    lines.push(inspect(args));
  };
  return { log: record, error: record, warn: record, debug: record, verbose: record };
}

describe('employee-service HR update employee', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let database: Database;
  let update: IEmployeeUpdateService;
  let auth: FakeAuthAdministration;
  let masterReader: MasterReaderOverride;
  let detailReader: DetailReaderOverride;
  let keys: AuthKeySet;
  // The recorder keeps this array, so tests clear it in place rather than replacing it.
  const loggedLines: string[] = [];
  let hrAccountId: string;
  let otherHrAccountId: string;
  let employeeToken: string;
  let hrToken: string;
  let positionIdByCode: Map<string, string>;
  let statusIdByCode: Map<string, string>;

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  }, CONTAINER_TIMEOUT_MS);

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18').start();
    auth = new FakeAuthAdministration(readStoredStatusCode);
    keys = employeeServiceAuthKeys();
    const config = parseConfig(
      EmployeeServiceConfigSchema,
      employeeServiceEnvironment({
        EMPLOYEE_DATABASE_URL: container.getConnectionUri(),
        EMPLOYEE_MASTER_DATA: JSON.stringify(SEED_DOCUMENT),
      }),
    );
    const moduleRef = await Test.createTestingModule({ imports: [createAppModule(config)] })
      .overrideProvider(AUTH_ACCOUNT_CLIENT)
      .useValue(fakeAuthAccountClient)
      .overrideProvider(AUTH_ACCOUNT_ADMINISTRATION_CLIENT)
      .useValue(auth)
      .overrideProvider(MASTER_ASSIGNMENT_READER)
      .useFactory({
        factory: (database: Database) => {
          masterReader = new MasterReaderOverride(new MasterAssignmentRepository(database));
          return masterReader;
        },
        inject: [DATABASE],
      })
      .overrideProvider(EMPLOYEE_DETAIL_READER)
      .useFactory({
        factory: (database: Database) => {
          detailReader = new DetailReaderOverride(new EmployeeDetailRepository(database));
          return detailReader;
        },
        inject: [DATABASE],
      })
      .setLogger(createLogRecorder(loggedLines))
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app, { CORS_ORIGINS: [] });
    await app.init();
    database = moduleRef.get<Database>(DATABASE);
    update = moduleRef.get<IEmployeeUpdateService>(EMPLOYEE_UPDATE_SERVICE);

    hrAccountId = registerAccount(Role.HR);
    otherHrAccountId = registerAccount(Role.HR);
    const employeeAccountId = registerAccount(Role.EMPLOYEE);
    hrToken = signUserToken(keys, hrAccountId, Role.HR);
    employeeToken = signUserToken(keys, employeeAccountId, Role.EMPLOYEE);
    positionIdByCode = await loadIdsByCode(masterPositions);
    statusIdByCode = await loadIdsByCode(masterEmployeeStatuses);
    await seedProfile(hrAccountId, 'HR_OFFICER', 'ACTIVE');
    await seedProfile(otherHrAccountId, 'HR_OFFICER', 'ACTIVE');
    await seedProfile(employeeAccountId, 'FULLSTACK_DEVELOPER', 'ACTIVE');
  }, CONTAINER_TIMEOUT_MS);

  beforeEach(() => {
    auth.reset();
    loggedLines.length = 0;
    masterReader.trustAll = false;
    detailReader.staleStatus = undefined;
  });

  function registerAccount(role: Role): string {
    const accountId = randomUUID();
    accountDirectory.set(accountId, {
      id: accountId,
      email: `employee.${accountId}@dexa.test`,
      role,
    });
    return accountId;
  }

  async function loadIdsByCode(
    table: typeof masterPositions | typeof masterEmployeeStatuses,
  ): Promise<Map<string, string>> {
    const rows = await database.db.select({ id: table.id, code: table.code }).from(table);
    return new Map(rows.map((row) => [row.code, row.id]));
  }

  function positionId(code: string): string {
    const id = positionIdByCode.get(code);
    if (id === undefined) throw new Error(`The seed has no position ${code}.`);
    return id;
  }

  function statusId(code: string): string {
    const id = statusIdByCode.get(code);
    if (id === undefined) throw new Error(`The seed has no status ${code}.`);
    return id;
  }

  // A profile with a photo, so its completion depends only on the phone number.
  async function seedProfile(
    accountId: string,
    positionCode: string,
    statusCode: string,
    options: { readonly phoneNumber?: string | null; readonly photoKey?: string | null } = {},
  ): Promise<void> {
    const phoneNumber = options.phoneNumber === undefined ? PHONE : options.phoneNumber;
    const photoKey = options.photoKey === undefined ? PHOTO_KEY : options.photoKey;
    await database.db.insert(employees).values({
      accountId,
      name: 'Nadia Rahma',
      positionId: positionId(positionCode),
      employeeStatusId: statusId(statusCode),
      profileStatus: phoneNumber !== null && photoKey !== null ? 'COMPLETE' : 'INCOMPLETE',
      phoneNumber,
      photoKey,
    });
  }

  async function readStoredRow(accountId: string) {
    const [row] = await database.db
      .select({
        name: employees.name,
        positionId: employees.positionId,
        phoneNumber: employees.phoneNumber,
        photoKey: employees.photoKey,
        profileStatus: employees.profileStatus,
        updatedAt: employees.updatedAt,
        employeeStatusCode: masterEmployeeStatuses.code,
      })
      .from(employees)
      .innerJoin(masterEmployeeStatuses, eq(employees.employeeStatusId, masterEmployeeStatuses.id))
      .where(eq(employees.accountId, accountId))
      .limit(1);
    return row;
  }

  async function readStoredStatusCode(accountId: string): Promise<string | undefined> {
    return (await readStoredRow(accountId))?.employeeStatusCode;
  }

  // Sets the stored status of an existing master option, so a test can make it inactive and restore it after.
  async function setMasterActive(
    table: typeof masterPositions | typeof masterEmployeeStatuses,
    code: string,
    isActive: boolean,
  ): Promise<void> {
    await database.db.update(table).set({ isActive }).where(eq(table.code, code));
  }

  function patchEmployee(accountId: string, body: unknown, accessToken: string = hrToken) {
    return request(app.getHttpServer())
      .patch(`/api/v1/employees/${accountId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(body as object);
  }

  function patchOwnPhone(accessToken: string, phoneNumber: string | null) {
    return request(app.getHttpServer())
      .patch('/api/v1/employees/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ phoneNumber });
  }

  describe('profile fields (ADM-2)', () => {
    it(
      'should return 200 with the stored employee and recompute the profile status when HR completes the profile',
      async () => {
        const accountId = registerAccount(Role.EMPLOYEE);
        await seedProfile(accountId, 'HR_OFFICER', 'ACTIVE', { phoneNumber: null });

        const response = await patchEmployee(accountId, {
          positionId: positionId('FULLSTACK_DEVELOPER'),
          phoneNumber: PHONE,
        }).expect(200);

        const employee = employeeDetailSchema.parse(response.body);
        expect(employee).toMatchObject({
          accountId,
          name: 'Nadia Rahma',
          position: { code: 'FULLSTACK_DEVELOPER' },
          employeeStatus: { code: 'ACTIVE' },
          phoneNumber: PHONE,
          profileStatus: ProfileStatus.COMPLETE,
        });
        expect(await readStoredRow(accountId)).toMatchObject({
          positionId: positionId('FULLSTACK_DEVELOPER'),
          phoneNumber: PHONE,
          photoKey: PHOTO_KEY,
          profileStatus: ProfileStatus.COMPLETE,
        });
        expect(auth.calls).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should report only the changed name in the change set when HR changes only the name',
      async () => {
        const accountId = registerAccount(Role.EMPLOYEE);
        await seedProfile(accountId, 'HR_OFFICER', 'ACTIVE');

        const result = await update.updateEmployee({
          actorAccountId: hrAccountId,
          accountId,
          request: { name: 'Nadia R.' },
        });

        expect(result.changedFields).toEqual(['name']);
        expect(result.employee.name).toBe('Nadia R.');
        expect((await readStoredRow(accountId))?.name).toBe('Nadia R.');
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should write nothing and report an empty change set when the body repeats the stored values',
      async () => {
        const accountId = registerAccount(Role.EMPLOYEE);
        await seedProfile(accountId, 'HR_OFFICER', 'ACTIVE');
        const before = await readStoredRow(accountId);

        const result = await update.updateEmployee({
          actorAccountId: hrAccountId,
          accountId,
          request: {
            name: 'Nadia Rahma',
            positionId: positionId('HR_OFFICER'),
            phoneNumber: PHONE,
          },
        });

        expect(result.changedFields).toEqual([]);
        expect((await readStoredRow(accountId))?.updatedAt).toEqual(before?.updatedAt);
        expect(auth.calls).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should keep the employee self-service phone when HR later changes the name of the same profile',
      async () => {
        const accountId = registerAccount(Role.EMPLOYEE);
        const employeeAccessToken = signUserToken(keys, accountId, Role.EMPLOYEE);
        await seedProfile(accountId, 'HR_OFFICER', 'ACTIVE', { phoneNumber: null });

        await patchOwnPhone(employeeAccessToken, OTHER_PHONE).expect(200);
        await patchEmployee(accountId, { name: 'Nadia R.' }).expect(200);

        expect(await readStoredRow(accountId)).toMatchObject({
          name: 'Nadia R.',
          phoneNumber: OTHER_PHONE,
          photoKey: PHOTO_KEY,
          profileStatus: ProfileStatus.COMPLETE,
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should keep the self-service route for PATCH employees/me when the employee changes their own phone',
      async () => {
        const accountId = registerAccount(Role.EMPLOYEE);
        await seedProfile(accountId, 'HR_OFFICER', 'ACTIVE', { phoneNumber: null });

        const response = await patchOwnPhone(signUserToken(keys, accountId, Role.EMPLOYEE), PHONE);

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ accountId, phoneNumber: PHONE });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should refuse with 400 naming positionId when the requested position is inactive, without calling Auth',
      async () => {
        const accountId = registerAccount(Role.EMPLOYEE);
        await seedProfile(accountId, 'HR_OFFICER', 'ACTIVE');
        await setMasterActive(masterPositions, 'DATA_ANALYST', false);
        try {
          const response = await patchEmployee(accountId, {
            positionId: positionId('DATA_ANALYST'),
            employeeStatusId: statusId('INACTIVE'),
          }).expect(400);

          expect(response.body).toMatchObject({
            statusCode: 400,
            code: ErrorCode.VALIDATION_FAILED,
            message: 'positionId: must reference an existing active position.',
          });
          expect(auth.calls).toEqual([]);
          expect((await readStoredRow(accountId))?.employeeStatusCode).toBe('ACTIVE');
        } finally {
          await setMasterActive(masterPositions, 'DATA_ANALYST', true);
        }
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should refuse with 400 naming positionId and keep the row when the database rejects a position that was deactivated after the pre-check',
      async () => {
        const accountId = registerAccount(Role.EMPLOYEE);
        await seedProfile(accountId, 'HR_OFFICER', 'ACTIVE');
        await setMasterActive(masterPositions, 'DATA_ANALYST', false);
        masterReader.trustAll = true;
        try {
          const response = await patchEmployee(accountId, {
            positionId: positionId('DATA_ANALYST'),
          }).expect(400);

          expect(response.body).toMatchObject({
            code: ErrorCode.VALIDATION_FAILED,
            message: 'positionId: must reference an existing active position.',
          });
          expect((await readStoredRow(accountId))?.positionId).toBe(positionId('HR_OFFICER'));
        } finally {
          await setMasterActive(masterPositions, 'DATA_ANALYST', true);
        }
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 404 NOT_FOUND without calling Auth when the account has no profile',
      async () => {
        const response = await patchEmployee(randomUUID(), { name: 'Nobody' }).expect(404);

        expect(response.body).toEqual({
          statusCode: 404,
          code: 'NOT_FOUND',
          message: 'Employee profile not found.',
        });
        expect(auth.calls).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 400 without touching the profile when the account ID is not a UUID',
      async () => {
        const response = await patchEmployee('not-a-uuid', { name: 'Nadia R.' }).expect(400);

        expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
        expect(auth.calls).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 403 without a write when an employee token calls the HR route',
      async () => {
        const accountId = registerAccount(Role.EMPLOYEE);
        await seedProfile(accountId, 'HR_OFFICER', 'ACTIVE');

        const response = await patchEmployee(accountId, { name: 'Nadia R.' }, employeeToken).expect(
          403,
        );

        expect(response.body).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
        expect((await readStoredRow(accountId))?.name).toBe('Nadia Rahma');
      },
      TEST_TIMEOUT_MS,
    );

    it.each([
      { condition: 'the body is empty', body: {} },
      {
        condition: 'the body carries an account ID',
        body: { name: 'Nadia R.', accountId: randomUUID() },
      },
      {
        condition: 'the body carries a profile status',
        body: { name: 'Nadia R.', profileStatus: 'COMPLETE' },
      },
      { condition: 'the body carries an email', body: { email: 'nadia@dexa.test' } },
    ])(
      'should return 400 without a write when $condition',
      async ({ body }) => {
        const accountId = registerAccount(Role.EMPLOYEE);
        await seedProfile(accountId, 'HR_OFFICER', 'ACTIVE');

        const response = await patchEmployee(accountId, body).expect(400);

        expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
        expect(auth.calls).toEqual([]);
        expect((await readStoredRow(accountId))?.name).toBe('Nadia Rahma');
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reactivate Auth after the stored row changes when the snapshot shows a stale ACTIVE status',
      async () => {
        const accountId = registerAccount(Role.EMPLOYEE);
        await seedProfile(accountId, 'HR_OFFICER', 'INACTIVE');
        // The snapshot shows ACTIVE, as if read before a concurrent change. The stored row is INACTIVE.
        detailReader.staleStatus = {
          accountId,
          status: { id: statusId('ACTIVE'), code: 'ACTIVE', name: 'Active' },
        };

        await patchEmployee(accountId, { employeeStatusId: statusId('ACTIVE') }).expect(200);

        expect(auth.calls).toEqual([
          {
            kind: 'ACTIVE_STATUS',
            accountId,
            actorAccountId: hrAccountId,
            isActive: true,
            localStatusCode: 'ACTIVE',
          },
        ]);
        expect(await readStoredRow(accountId)).toMatchObject({ employeeStatusCode: 'ACTIVE' });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should deactivate Auth before the stored row changes when the snapshot shows a stale INACTIVE status',
      async () => {
        const accountId = registerAccount(Role.EMPLOYEE);
        await seedProfile(accountId, 'HR_OFFICER', 'ACTIVE');
        // The snapshot shows INACTIVE, as if read before a concurrent change. The stored row is ACTIVE.
        detailReader.staleStatus = {
          accountId,
          status: { id: statusId('INACTIVE'), code: 'INACTIVE', name: 'Inactive' },
        };

        await patchEmployee(accountId, { employeeStatusId: statusId('INACTIVE') }).expect(200);

        expect(auth.calls).toEqual([
          {
            kind: 'ACTIVE_STATUS',
            accountId,
            actorAccountId: hrAccountId,
            isActive: false,
            localStatusCode: 'ACTIVE',
          },
        ]);
        expect(await readStoredRow(accountId)).toMatchObject({ employeeStatusCode: 'INACTIVE' });
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('deactivation and reactivation (D-13, AUTH-5)', () => {
    it(
      'should call Auth to deactivate before the stored status is written, then store INACTIVE',
      async () => {
        const accountId = registerAccount(Role.EMPLOYEE);
        await seedProfile(accountId, 'HR_OFFICER', 'ACTIVE');

        const response = await patchEmployee(accountId, {
          employeeStatusId: statusId('INACTIVE'),
        }).expect(200);

        expect(employeeDetailSchema.parse(response.body).employeeStatus.code).toBe('INACTIVE');
        expect(auth.calls).toEqual([
          {
            kind: 'ACTIVE_STATUS',
            accountId,
            actorAccountId: hrAccountId,
            isActive: false,
            localStatusCode: 'ACTIVE',
          },
        ]);
        expect(await readStoredRow(accountId)).toMatchObject({ employeeStatusCode: 'INACTIVE' });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should leave the profile unchanged and report accountStatusSaved as null when Auth cannot confirm the deactivation',
      async () => {
        const accountId = registerAccount(Role.EMPLOYEE);
        await seedProfile(accountId, 'HR_OFFICER', 'ACTIVE');
        auth.outage = { activeStatus: 'BEFORE_CHANGE', passwordReset: 'NONE' };

        const response = await patchEmployee(accountId, {
          name: 'Nadia R.',
          employeeStatusId: statusId('INACTIVE'),
        }).expect(503);

        expect(response.body).toMatchObject({
          code: ErrorCode.EMPLOYEE_UPDATE_INCOMPLETE,
          details: {
            accountId,
            profileSaved: false,
            accountStatusSaved: null,
            passwordReset: null,
          },
        });
        expect(await readStoredRow(accountId)).toMatchObject({
          name: 'Nadia Rahma',
          employeeStatusCode: 'ACTIVE',
        });
        expect(
          loggedLines.some((line) => line.includes(accountId) && line.includes('account status')),
        ).toBe(true);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should report accountStatusSaved null and keep the profile when the deactivation applied but its answer was lost',
      async () => {
        const accountId = registerAccount(Role.EMPLOYEE);
        await seedProfile(accountId, 'HR_OFFICER', 'ACTIVE');
        auth.outage = { activeStatus: 'AFTER_CHANGE', passwordReset: 'NONE' };

        const response = await patchEmployee(accountId, {
          employeeStatusId: statusId('INACTIVE'),
        }).expect(503);

        expect(response.body).toMatchObject({
          details: { profileSaved: false, accountStatusSaved: null, passwordReset: null },
        });
        expect((await readStoredRow(accountId))?.employeeStatusCode).toBe('ACTIVE');
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should report accountStatusSaved true and profileSaved false when the database rejects the status after Auth deactivated the account',
      async () => {
        const accountId = registerAccount(Role.EMPLOYEE);
        await seedProfile(accountId, 'HR_OFFICER', 'ACTIVE');
        await setMasterActive(masterEmployeeStatuses, 'INACTIVE', false);
        masterReader.trustAll = true;
        try {
          const response = await patchEmployee(accountId, {
            employeeStatusId: statusId('INACTIVE'),
          }).expect(503);

          expect(response.body).toMatchObject({
            code: ErrorCode.EMPLOYEE_UPDATE_INCOMPLETE,
            details: { profileSaved: false, accountStatusSaved: true, passwordReset: null },
          });
          expect(auth.calls).toHaveLength(1);
          expect((await readStoredRow(accountId))?.employeeStatusCode).toBe('ACTIVE');
        } finally {
          await setMasterActive(masterEmployeeStatuses, 'INACTIVE', true);
        }
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should refuse with 409 and call nothing when HR deactivates their own account',
      async () => {
        const response = await patchEmployee(hrAccountId, {
          employeeStatusId: statusId('INACTIVE'),
        }).expect(409);

        expect(response.body).toEqual({
          statusCode: 409,
          code: 'CONFLICT',
          message: 'An HR account cannot deactivate its own account.',
        });
        expect(auth.calls).toEqual([]);
        expect((await readStoredRow(hrAccountId))?.employeeStatusCode).toBe('ACTIVE');
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should refuse with 409 and call nothing when HR re-sends INACTIVE for their own account that is already stored INACTIVE',
      async () => {
        const selfAccountId = registerAccount(Role.HR);
        await seedProfile(selfAccountId, 'HR_OFFICER', 'INACTIVE');

        const response = await patchEmployee(
          selfAccountId,
          { employeeStatusId: statusId('INACTIVE') },
          signUserToken(keys, selfAccountId, Role.HR),
        ).expect(409);

        expect(response.body).toMatchObject({ statusCode: 409, code: 'CONFLICT' });
        expect(auth.calls).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should store ACTIVE before calling Auth to reactivate the account',
      async () => {
        const accountId = registerAccount(Role.EMPLOYEE);
        await seedProfile(accountId, 'HR_OFFICER', 'INACTIVE');

        await patchEmployee(accountId, { employeeStatusId: statusId('ACTIVE') }).expect(200);

        expect(auth.calls).toEqual([
          {
            kind: 'ACTIVE_STATUS',
            accountId,
            actorAccountId: hrAccountId,
            isActive: true,
            localStatusCode: 'ACTIVE',
          },
        ]);
        expect(await readStoredRow(accountId)).toMatchObject({ employeeStatusCode: 'ACTIVE' });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should report profileSaved true and accountStatusSaved null when Auth fails to reactivate after the profile saved',
      async () => {
        const accountId = registerAccount(Role.EMPLOYEE);
        await seedProfile(accountId, 'HR_OFFICER', 'INACTIVE');
        auth.outage = { activeStatus: 'BEFORE_CHANGE', passwordReset: 'NONE' };

        const response = await patchEmployee(accountId, {
          employeeStatusId: statusId('ACTIVE'),
        }).expect(503);

        expect(response.body).toMatchObject({
          code: ErrorCode.EMPLOYEE_UPDATE_INCOMPLETE,
          details: { accountId, profileSaved: true, accountStatusSaved: null, passwordReset: null },
        });
        expect((await readStoredRow(accountId))?.employeeStatusCode).toBe('ACTIVE');
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should set Auth active after the stored status moves to another active status, once the row is written',
      async () => {
        const accountId = registerAccount(Role.EMPLOYEE);
        await seedProfile(accountId, 'HR_OFFICER', 'ACTIVE');

        await patchEmployee(accountId, { employeeStatusId: statusId('ON_LEAVE') }).expect(200);

        expect(auth.calls).toEqual([
          {
            kind: 'ACTIVE_STATUS',
            accountId,
            actorAccountId: hrAccountId,
            isActive: true,
            localStatusCode: 'ON_LEAVE',
          },
        ]);
        expect(await readStoredRow(accountId)).toMatchObject({ employeeStatusCode: 'ON_LEAVE' });
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('repeated status requests repair Auth (D-13)', () => {
    it(
      'should bring Auth active when a retry repeats ACTIVE after a failed reactivation',
      async () => {
        const accountId = registerAccount(Role.EMPLOYEE);
        await seedProfile(accountId, 'HR_OFFICER', 'INACTIVE');
        const body = { employeeStatusId: statusId('ACTIVE') };
        auth.outage = { activeStatus: 'BEFORE_CHANGE', passwordReset: 'NONE' };

        const failed = await patchEmployee(accountId, body).expect(503);

        expect(failed.body).toMatchObject({
          code: ErrorCode.EMPLOYEE_UPDATE_INCOMPLETE,
          details: { accountId, profileSaved: true, accountStatusSaved: null, passwordReset: null },
        });
        expect(auth.activeFlags.has(accountId)).toBe(false);
        expect((await readStoredRow(accountId))?.employeeStatusCode).toBe('ACTIVE');

        auth.outage = { activeStatus: 'NONE', passwordReset: 'NONE' };
        await patchEmployee(accountId, body).expect(200);

        const reactivation = {
          kind: 'ACTIVE_STATUS',
          accountId,
          actorAccountId: hrAccountId,
          isActive: true,
          localStatusCode: 'ACTIVE',
        };
        expect(auth.calls).toEqual([reactivation, reactivation]);
        expect(auth.activeFlags.get(accountId)).toBe(true);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should make one Auth call with the active flag and write no row when HR re-sends the stored ACTIVE status',
      async () => {
        const accountId = registerAccount(Role.EMPLOYEE);
        await seedProfile(accountId, 'HR_OFFICER', 'ACTIVE');
        const before = await readStoredRow(accountId);

        await patchEmployee(accountId, { employeeStatusId: statusId('ACTIVE') }).expect(200);

        expect(auth.calls).toEqual([
          {
            kind: 'ACTIVE_STATUS',
            accountId,
            actorAccountId: hrAccountId,
            isActive: true,
            localStatusCode: 'ACTIVE',
          },
        ]);
        expect(auth.activeFlags.get(accountId)).toBe(true);
        expect((await readStoredRow(accountId))?.updatedAt).toEqual(before?.updatedAt);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should make no Auth status call when the request names no status',
      async () => {
        const accountId = registerAccount(Role.EMPLOYEE);
        await seedProfile(accountId, 'HR_OFFICER', 'ACTIVE');

        await patchEmployee(accountId, { name: 'Nadia R.', phoneNumber: OTHER_PHONE }).expect(200);

        expect(auth.calls).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('password reset (ADM-2, PRO-5)', () => {
    it(
      'should reset the password through Auth once with the HR actor, and keep it out of the response, the row, and the log',
      async () => {
        const accountId = registerAccount(Role.EMPLOYEE);
        await seedProfile(accountId, 'HR_OFFICER', 'ACTIVE');

        const response = await patchEmployee(accountId, { newPassword: RESET_PASSWORD }).expect(
          200,
        );

        expect(auth.calls).toEqual([
          {
            kind: 'PASSWORD_RESET',
            accountId,
            actorAccountId: hrAccountId,
            newPassword: RESET_PASSWORD,
          },
        ]);
        expect(JSON.stringify(response.body)).not.toContain(RESET_PASSWORD);
        expect(JSON.stringify(await readStoredRow(accountId))).not.toContain(RESET_PASSWORD);
        expect(loggedLines.join('\n')).not.toContain(RESET_PASSWORD);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should write no profile row when the request names only a password',
      async () => {
        const accountId = registerAccount(Role.EMPLOYEE);
        await seedProfile(accountId, 'HR_OFFICER', 'ACTIVE');
        const before = await readStoredRow(accountId);

        const result = await update.updateEmployee({
          actorAccountId: hrAccountId,
          accountId,
          request: { newPassword: RESET_PASSWORD },
        });

        expect(result.changedFields).toEqual([]);
        expect((await readStoredRow(accountId))?.updatedAt).toEqual(before?.updatedAt);
        expect(auth.calls).toHaveLength(1);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should report passwordReset null and the saved profile when Auth fails the reset',
      async () => {
        const accountId = registerAccount(Role.EMPLOYEE);
        await seedProfile(accountId, 'HR_OFFICER', 'ACTIVE');
        auth.outage = { activeStatus: 'NONE', passwordReset: 'BEFORE_CHANGE' };

        const response = await patchEmployee(accountId, {
          name: 'Nadia R.',
          newPassword: RESET_PASSWORD,
        }).expect(503);

        expect(response.body).toMatchObject({
          code: ErrorCode.EMPLOYEE_UPDATE_INCOMPLETE,
          details: { accountId, profileSaved: true, accountStatusSaved: null, passwordReset: null },
        });
        expect((await readStoredRow(accountId))?.name).toBe('Nadia R.');
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should call Auth for the password only after the status change saved, when one request does both',
      async () => {
        const accountId = registerAccount(Role.EMPLOYEE);
        await seedProfile(accountId, 'HR_OFFICER', 'ACTIVE');

        await patchEmployee(accountId, {
          employeeStatusId: statusId('INACTIVE'),
          newPassword: RESET_PASSWORD,
        }).expect(200);

        expect(auth.calls.map((call) => call.kind)).toEqual(['ACTIVE_STATUS', 'PASSWORD_RESET']);
      },
      TEST_TIMEOUT_MS,
    );
  });
});
