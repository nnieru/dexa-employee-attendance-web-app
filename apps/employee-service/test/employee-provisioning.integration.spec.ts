import { randomUUID } from 'node:crypto';
import {
  ConflictError,
  DependencyUnavailableError,
  NotFoundError,
  configureApp,
  parseConfig,
  ServiceName,
} from '@dexa/common';
import {
  AccountProvisioningStatus,
  ErrorCode,
  ProfileStatus,
  Role,
  employeeDetailSchema,
  type AccountLookupItem,
  type AccountProvisioningOperation,
  type AccountProvisioningRequest,
  type AccountReference,
  type CreateEmployeeRequest,
  type EmployeeDetail,
} from '@dexa/contracts';
import type { Database } from '@dexa/db';
import type { INestApplication, LoggerService } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq } from 'drizzle-orm';
import { inspect } from 'node:util';
import request from 'supertest';
import { createAppModule } from '../src/app.module.js';
import {
  AUTH_ACCOUNT_CLIENT,
  type IAuthAccountClient,
} from '../src/auth-accounts/auth-account-client.interface.js';
import { EmployeeServiceConfigSchema } from '../src/config/employee-service-config.schema.js';
import { DATABASE } from '../src/infrastructure/db/database.token.js';
import {
  employeeProvisioningOperations,
  employees,
  masterEmployeeStatuses,
  masterPositions,
} from '../src/infrastructure/db/schema.js';
import {
  AUTH_PROVISIONING_CLIENT,
  type IAuthProvisioningClient,
} from '../src/provisioning/auth-provisioning-client.interface.js';
import type { AuthKeySet } from './auth-key-set.js';
import { signGatewayUserToken } from './gateway-user-token.js';
import {
  employeeServiceAuthKeys,
  employeeServiceEnvironment,
} from './employee-service-environment.js';

// Starting the container pulls an image on a cold machine, which exceeds Jest's 5 second default.
const CONTAINER_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 30_000;
const CREATE_PATH = '/api/v1/employees';
const INCOMPLETE_CODE = ErrorCode.EMPLOYEE_PROVISIONING_INCOMPLETE;
const PASSWORD = 'initial-pass-1';
const PHONE = '+6281234567890';
const SEED_DOCUMENT = {
  positions: [
    { code: 'HR_OFFICER', name: 'HR Officer' },
    { code: 'FULLSTACK_DEVELOPER', name: 'Fullstack Developer' },
    { code: 'DATA_ANALYST', name: 'Data Analyst' },
  ],
  employeeStatuses: [
    { code: 'ACTIVE', name: 'Active' },
    { code: 'INACTIVE', name: 'Inactive' },
  ],
};

// Stands in for auth-service. It follows the same rules as the real provisioning routes: a same-request replay
// answers the stored account, a different request under a stored ID conflicts, an email in use conflicts, and an
// activation is idempotent. An outage either stops a call before it changes state or drops the answer after it.
type AuthOutage = 'NONE' | 'BEFORE_CHANGE' | 'AFTER_CHANGE';

type FakeAuthOperation = {
  readonly operationId: string;
  readonly accountId: string;
  readonly actorAccountId: string;
  readonly email: string;
  readonly role: Role;
  readonly password: string;
  status: AccountProvisioningStatus;
};

function answering<TValue>(work: () => TValue): Promise<TValue> {
  try {
    return Promise.resolve(work());
  } catch (error: unknown) {
    return Promise.reject(error instanceof Error ? error : new Error('Non-error thrown.'));
  }
}

function unavailableError(): DependencyUnavailableError {
  return new DependencyUnavailableError(ErrorCode.DEPENDENCY_UNAVAILABLE, 'Auth is unavailable.');
}

function toAnswer(operation: FakeAuthOperation): AccountProvisioningOperation {
  return {
    operationId: operation.operationId,
    accountId: operation.accountId,
    status: operation.status,
  };
}

class FakeAuth implements IAuthProvisioningClient, IAuthAccountClient {
  readonly calls: string[] = [];
  outage: { readonly create: AuthOutage; readonly activate: AuthOutage } = {
    create: 'NONE',
    activate: 'NONE',
  };
  // When set, the next new account takes this ID, so a test can give it a profile before the create.
  presetAccountId: string | undefined;
  private readonly operations = new Map<string, FakeAuthOperation>();

  setOutage(outage: { readonly create?: AuthOutage; readonly activate?: AuthOutage }): void {
    this.outage = { create: outage.create ?? 'NONE', activate: outage.activate ?? 'NONE' };
  }

  createOperation(request: AccountProvisioningRequest): Promise<AccountProvisioningOperation> {
    return answering(() => {
      this.calls.push('create');
      if (this.outage.create === 'BEFORE_CHANGE') throw unavailableError();
      const stored = this.operations.get(request.operationId);
      if (stored !== undefined) {
        if (!isSameFakeRequest(stored, request)) {
          throw new ConflictError(
            ErrorCode.CONFLICT,
            'This operation ID was already used for a different request.',
          );
        }
        return toAnswer(stored);
      }
      if (this.findByEmail(request.email) !== undefined) {
        throw new ConflictError(ErrorCode.CONFLICT, 'An account already uses this company email.');
      }
      const created: FakeAuthOperation = {
        operationId: request.operationId,
        accountId: this.presetAccountId ?? randomUUID(),
        actorAccountId: request.actorAccountId,
        email: request.email,
        role: request.role,
        password: request.initialPassword,
        status: AccountProvisioningStatus.PENDING,
      };
      this.presetAccountId = undefined;
      this.operations.set(created.operationId, created);
      if (this.outage.create === 'AFTER_CHANGE') throw unavailableError();
      return toAnswer(created);
    });
  }

  activateOperation(operationId: string): Promise<AccountProvisioningOperation> {
    return answering(() => {
      this.calls.push('activate');
      if (this.outage.activate === 'BEFORE_CHANGE') throw unavailableError();
      const operation = this.requireOperation(operationId);
      operation.status = AccountProvisioningStatus.ACTIVE;
      if (this.outage.activate === 'AFTER_CHANGE') throw unavailableError();
      return toAnswer(operation);
    });
  }

  getOperation(operationId: string): Promise<AccountProvisioningOperation> {
    return answering(() => {
      this.calls.push('get');
      return toAnswer(this.requireOperation(operationId));
    });
  }

  // Auth's lookups answer only for active accounts, as the real lookups do, so a pending account is not visible.
  findAccountById(accountId: string): Promise<AccountLookupItem | undefined> {
    return answering(() => {
      const operation = [...this.operations.values()].find(
        (candidate) =>
          candidate.accountId === accountId &&
          candidate.status === AccountProvisioningStatus.ACTIVE,
      );
      return operation === undefined
        ? undefined
        : { id: operation.accountId, email: operation.email, role: operation.role };
    });
  }

  // Answers the same as findAccountById, one account at a time, so the batched lookup never disagrees with it.
  async lookupAccounts(accountIds: ReadonlyArray<string>): Promise<AccountLookupItem[]> {
    const accounts = await Promise.all(
      accountIds.map((accountId) => this.findAccountById(accountId)),
    );
    return accounts.filter((account): account is AccountLookupItem => account !== undefined);
  }

  searchAccountIdsByEmail(): Promise<string[]> {
    return Promise.reject(new Error('The provisioning specs do not search accounts.'));
  }

  findAccountReferenceByEmail(email: string): Promise<AccountReference | undefined> {
    return answering(() => {
      const operation = this.findByEmail(email);
      return operation === undefined || operation.status !== AccountProvisioningStatus.ACTIVE
        ? undefined
        : { id: operation.accountId, role: operation.role };
    });
  }

  // Test-only: the password of an operation, so a test can check that Auth received it.
  storedPasswordFor(operationId: string): string | undefined {
    return this.operations.get(operationId)?.password;
  }

  statusOf(operationId: string): AccountProvisioningStatus | undefined {
    return this.operations.get(operationId)?.status;
  }

  private findByEmail(email: string): FakeAuthOperation | undefined {
    return [...this.operations.values()].find((operation) => operation.email === email);
  }

  private requireOperation(operationId: string): FakeAuthOperation {
    const operation = this.operations.get(operationId);
    if (operation === undefined) throw new NotFoundError(ErrorCode.NOT_FOUND, 'Not found.');
    return operation;
  }
}

function isSameFakeRequest(
  stored: FakeAuthOperation,
  request: AccountProvisioningRequest,
): boolean {
  return (
    stored.actorAccountId === request.actorAccountId &&
    stored.email === request.email &&
    stored.role === request.role &&
    stored.password === request.initialPassword
  );
}

// Signs the token that api-gateway sends to this service for the user.
function signUserToken(keys: AuthKeySet, accountId: string, role: Role): string {
  return signGatewayUserToken(keys, ServiceName.EMPLOYEE_SERVICE, accountId, role);
}

// Records every line that the modules log at any level, so a test can check what reached the log.
function createLogRecorder(lines: string[]): LoggerService {
  const record = (...args: unknown[]): void => {
    lines.push(inspect(args));
  };
  return { log: record, error: record, warn: record, debug: record, verbose: record };
}

function uniqueEmail(): string {
  return `new.hire.${randomUUID()}@dexa.test`;
}

describe('employee-service HR create employee', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let database: Database;
  let auth: FakeAuth;
  let keys: AuthKeySet;
  // The recorder keeps this array, so tests clear it in place rather than replacing it.
  const loggedLines: string[] = [];
  let hrToken: string;
  let otherHrToken: string;
  let employeeToken: string;
  let hrAccountId: string;
  let otherHrAccountId: string;
  let positionIdByCode: Map<string, string>;
  let statusIdByCode: Map<string, string>;

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  }, CONTAINER_TIMEOUT_MS);

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18').start();
    auth = new FakeAuth();
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
      .useValue(auth)
      .overrideProvider(AUTH_PROVISIONING_CLIENT)
      .useValue(auth)
      .setLogger(createLogRecorder(loggedLines))
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app, { CORS_ORIGINS: [] });
    await app.init();
    database = moduleRef.get<Database>(DATABASE);

    hrAccountId = registerActiveAccount();
    otherHrAccountId = registerActiveAccount();
    const employeeAccountId = registerActiveAccount();
    hrToken = signUserToken(keys, hrAccountId, Role.HR);
    otherHrToken = signUserToken(keys, otherHrAccountId, Role.HR);
    employeeToken = signUserToken(keys, employeeAccountId, Role.EMPLOYEE);

    positionIdByCode = await loadIdsByCode(masterPositions);
    statusIdByCode = await loadIdsByCode(masterEmployeeStatuses);
  }, CONTAINER_TIMEOUT_MS);

  beforeEach(() => {
    auth.setOutage({});
    auth.presetAccountId = undefined;
    auth.calls.length = 0;
    loggedLines.length = 0;
  });

  function registerActiveAccount(): string {
    const accountId = randomUUID();
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

  function buildBody(overrides: Partial<CreateEmployeeRequest> = {}): CreateEmployeeRequest {
    return {
      operationId: randomUUID(),
      name: 'Nadia Rahma',
      email: uniqueEmail(),
      positionId: positionId('FULLSTACK_DEVELOPER'),
      employeeStatusId: statusId('ACTIVE'),
      phoneNumber: null,
      role: Role.EMPLOYEE,
      initialPassword: PASSWORD,
      ...overrides,
    };
  }

  function postCreate(body: unknown, accessToken: string = hrToken) {
    return request(app.getHttpServer())
      .post(CREATE_PATH)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(body as object);
  }

  async function createOk(
    body: CreateEmployeeRequest,
    accessToken: string = hrToken,
  ): Promise<EmployeeDetail> {
    const response = await postCreate(body, accessToken).expect(201);
    return employeeDetailSchema.parse(response.body);
  }

  async function loadOperation(operationId: string) {
    const [row] = await database.db
      .select()
      .from(employeeProvisioningOperations)
      .where(eq(employeeProvisioningOperations.operationId, operationId));
    return row;
  }

  async function countProfiles(accountId: string): Promise<number> {
    const rows = await database.db
      .select({ accountId: employees.accountId })
      .from(employees)
      .where(eq(employees.accountId, accountId));
    return rows.length;
  }

  async function loadProfile(accountId: string) {
    const [row] = await database.db
      .select()
      .from(employees)
      .where(eq(employees.accountId, accountId));
    return row;
  }

  // Every stored row of the operation and its profile, as text, to show that no password is stored.
  async function storedRowsText(
    operationId: string,
    accountId: string | undefined,
  ): Promise<string> {
    const operations = await database.db
      .select()
      .from(employeeProvisioningOperations)
      .where(eq(employeeProvisioningOperations.operationId, operationId));
    const profiles =
      accountId === undefined
        ? []
        : await database.db.select().from(employees).where(eq(employees.accountId, accountId));
    return JSON.stringify({ operations, profiles });
  }

  it(
    'should create the account, save the profile, and activate the account when the request is new',
    async () => {
      const body = buildBody();

      const detail = await createOk(body);

      expect(detail).toEqual({
        accountId: expect.any(String) as string,
        name: 'Nadia Rahma',
        email: body.email,
        role: Role.EMPLOYEE,
        position: {
          id: positionId('FULLSTACK_DEVELOPER'),
          code: 'FULLSTACK_DEVELOPER',
          name: 'Fullstack Developer',
        },
        employeeStatus: { id: statusId('ACTIVE'), code: 'ACTIVE', name: 'Active' },
        phoneNumber: null,
        profileStatus: ProfileStatus.INCOMPLETE,
      });
      expect(await loadOperation(body.operationId)).toMatchObject({
        state: 'ACTIVE',
        accountId: detail.accountId,
      });
      expect(await loadProfile(detail.accountId)).toMatchObject({
        name: 'Nadia Rahma',
        phoneNumber: null,
        photoKey: null,
        profileStatus: ProfileStatus.INCOMPLETE,
      });
      expect(auth.statusOf(body.operationId)).toBe(AccountProvisioningStatus.ACTIVE);
      expect(auth.storedPasswordFor(body.operationId)).toBe(PASSWORD);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should store the phone number as given while the profile stays INCOMPLETE without a photo',
    async () => {
      const body = buildBody({ phoneNumber: PHONE });

      const detail = await createOk(body);

      expect(detail.phoneNumber).toBe(PHONE);
      expect(await loadProfile(detail.accountId)).toMatchObject({
        phoneNumber: PHONE,
        photoKey: null,
        profileStatus: ProfileStatus.INCOMPLETE,
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should keep the password out of the stored rows and the log',
    async () => {
      const body = buildBody();

      const detail = await createOk(body);

      expect(await storedRowsText(body.operationId, detail.accountId)).not.toContain(PASSWORD);
      expect(loggedLines.join('\n')).not.toContain(PASSWORD);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return the same employee and keep one profile when the same request is retried',
    async () => {
      const body = buildBody();
      const first = await createOk(body);
      auth.calls.length = 0;

      const second = await createOk(body);

      expect(second.accountId).toBe(first.accountId);
      expect(auth.calls).toEqual(['create']);
      expect(await countProfiles(first.accountId)).toBe(1);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should keep the profile that HR edited when a matching retry arrives after the edit',
    async () => {
      const body = buildBody();
      const first = await createOk(body);
      await database.db
        .update(employees)
        .set({ name: 'Nadia R. Edited' })
        .where(eq(employees.accountId, first.accountId));

      const retried = await createOk(body);

      expect(retried.name).toBe('Nadia R. Edited');
      expect((await loadProfile(first.accountId))?.name).toBe('Nadia R. Edited');
      expect(await countProfiles(first.accountId)).toBe(1);
    },
    TEST_TIMEOUT_MS,
  );

  // The overrides are functions, so the seed IDs are read when a test runs, after the seed has loaded.
  it.each([
    {
      condition: 'the name differs',
      overrides: (): Partial<CreateEmployeeRequest> => ({ name: 'Nadia R.' }),
    },
    {
      condition: 'the phone number differs',
      overrides: (): Partial<CreateEmployeeRequest> => ({ phoneNumber: '+6281234500000' }),
    },
    {
      condition: 'the position differs',
      overrides: (): Partial<CreateEmployeeRequest> => ({ positionId: positionId('HR_OFFICER') }),
    },
    {
      condition: 'the employee status differs',
      overrides: (): Partial<CreateEmployeeRequest> => ({ employeeStatusId: statusId('INACTIVE') }),
    },
  ])(
    'should answer 409 without calling Auth when the same operation ID carries a request where $condition',
    async ({ overrides }) => {
      const body = buildBody();
      await createOk(body);
      auth.calls.length = 0;

      const response = await postCreate({ ...body, ...overrides() }).expect(409);

      expect(response.body).toEqual({
        statusCode: 409,
        code: ErrorCode.CONFLICT,
        message: 'This operation ID was already used for a different request.',
      });
      expect(auth.calls).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should answer 409 without calling Auth when another HR account reuses the operation ID',
    async () => {
      const body = buildBody();
      await createOk(body);
      auth.calls.length = 0;

      await postCreate(body, otherHrToken).expect(409);

      expect(auth.calls).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should answer 503 with the reserved phase and no account when Auth cannot be reached, and finish on retry',
    async () => {
      const body = buildBody();
      auth.setOutage({ create: 'BEFORE_CHANGE' });

      const response = await postCreate(body).expect(503);

      expect(response.body).toEqual({
        statusCode: 503,
        code: INCOMPLETE_CODE,
        message: 'Employee creation did not finish. Retry with the same operation ID to finish it.',
        details: { operationId: body.operationId, savedPhase: 'RESERVED' },
      });
      expect(await loadOperation(body.operationId)).toMatchObject({
        state: 'RESERVED',
        accountId: null,
      });
      expect(loggedLines.join('\n')).toContain(body.operationId);
      expect(loggedLines.join('\n')).not.toContain(body.email);

      auth.setOutage({});
      const detail = await createOk(body);

      expect(await loadOperation(body.operationId)).toMatchObject({
        state: 'ACTIVE',
        accountId: detail.accountId,
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should reuse the account that Auth created when its answer to the first create was lost',
    async () => {
      const body = buildBody();
      auth.setOutage({ create: 'AFTER_CHANGE' });
      await postCreate(body).expect(503);
      const reserved = await loadOperation(body.operationId);
      expect(reserved).toMatchObject({ state: 'RESERVED', accountId: null });

      auth.setOutage({});
      const detail = await createOk(body);

      expect(detail.email).toBe(body.email);
      expect(await countProfiles(detail.accountId)).toBe(1);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should answer 503 with the saved phase and account when activation cannot be reached, then activate on retry without a second profile',
    async () => {
      const body = buildBody();
      auth.setOutage({ activate: 'BEFORE_CHANGE' });

      const response = await postCreate(body).expect(503);

      const accountId = (await loadOperation(body.operationId))?.accountId;
      expect(accountId).toEqual(expect.any(String));
      expect(response.body).toMatchObject({
        statusCode: 503,
        code: INCOMPLETE_CODE,
        details: { operationId: body.operationId, savedPhase: 'PROFILE_SAVED', accountId },
      });
      expect(await loadOperation(body.operationId)).toMatchObject({ state: 'PROFILE_SAVED' });
      expect(await countProfiles(accountId as string)).toBe(1);

      auth.setOutage({});
      const detail = await createOk(body);

      expect(detail.accountId).toBe(accountId);
      expect(await countProfiles(detail.accountId)).toBe(1);
      expect(await loadOperation(body.operationId)).toMatchObject({ state: 'ACTIVE' });
      expect(auth.statusOf(body.operationId)).toBe(AccountProvisioningStatus.ACTIVE);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should activate on retry when Auth activated the account but the activation answer was lost',
    async () => {
      const body = buildBody();
      auth.setOutage({ activate: 'AFTER_CHANGE' });
      await postCreate(body).expect(503);
      expect(auth.statusOf(body.operationId)).toBe(AccountProvisioningStatus.ACTIVE);
      expect(await loadOperation(body.operationId)).toMatchObject({ state: 'PROFILE_SAVED' });

      auth.setOutage({});
      const detail = await createOk(body);

      expect(await loadOperation(body.operationId)).toMatchObject({
        state: 'ACTIVE',
        accountId: detail.accountId,
      });
      expect(await countProfiles(detail.accountId)).toBe(1);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should answer 409 and leave no profile when Auth reports that the email is already in use',
    async () => {
      const email = uniqueEmail();
      await createOk(buildBody({ email }));
      const body = buildBody({ email });

      const response = await postCreate(body).expect(409);

      expect(response.body).toEqual({
        statusCode: 409,
        code: ErrorCode.CONFLICT,
        message: 'An account already uses this company email.',
      });
      expect(await loadOperation(body.operationId)).toMatchObject({
        state: 'RESERVED',
        accountId: null,
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should answer 409 and keep the existing profile when the new account already has one',
    async () => {
      const existingAccountId = randomUUID();
      await database.db.insert(employees).values({
        accountId: existingAccountId,
        name: 'Existing Employee',
        positionId: positionId('HR_OFFICER'),
        employeeStatusId: statusId('ACTIVE'),
        profileStatus: ProfileStatus.INCOMPLETE,
        phoneNumber: null,
        photoKey: null,
      });
      auth.presetAccountId = existingAccountId;
      const body = buildBody();

      await postCreate(body).expect(409);

      expect((await loadProfile(existingAccountId))?.name).toBe('Existing Employee');
      expect(await loadOperation(body.operationId)).toMatchObject({
        state: 'RESERVED',
        accountId: null,
      });
    },
    TEST_TIMEOUT_MS,
  );

  it.each([
    { master: 'position', table: masterPositions, code: 'DATA_ANALYST', field: 'positionId' },
    {
      master: 'employee status',
      table: masterEmployeeStatuses,
      code: 'INACTIVE',
      field: 'employeeStatusId',
    },
  ])(
    'should answer 400 naming $field and not call Auth when the $master is inactive',
    async ({ table, code, field }) => {
      await database.db.update(table).set({ isActive: false }).where(eq(table.code, code));
      try {
        const body = buildBody(
          field === 'positionId'
            ? { positionId: positionId(code) }
            : { employeeStatusId: statusId(code) },
        );

        const response = await postCreate(body).expect(400);

        expect(response.body).toMatchObject({ statusCode: 400, code: ErrorCode.VALIDATION_FAILED });
        expect(response.body.message).toContain(field);
        expect(auth.calls).toEqual([]);
        expect(await loadOperation(body.operationId)).toBeUndefined();
      } finally {
        await database.db.update(table).set({ isActive: true }).where(eq(table.code, code));
      }
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should answer 400 and not call Auth when the body carries a field that the server decides',
    async () => {
      const response = await postCreate({
        ...buildBody(),
        profileStatus: ProfileStatus.COMPLETE,
      }).expect(400);

      expect(response.body).toMatchObject({ statusCode: 400, code: ErrorCode.VALIDATION_FAILED });
      expect(auth.calls).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should answer 403 and not call Auth when an employee token calls the route',
    async () => {
      const response = await postCreate(buildBody(), employeeToken).expect(403);

      expect(response.body).toMatchObject({ statusCode: 403, code: ErrorCode.FORBIDDEN });
      expect(auth.calls).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should answer 401 and not call Auth when no token is sent',
    async () => {
      const response = await request(app.getHttpServer())
        .post(CREATE_PATH)
        .send(buildBody())
        .expect(401);

      expect(response.body).toMatchObject({ statusCode: 401, code: ErrorCode.UNAUTHORIZED });
      expect(auth.calls).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );
});
