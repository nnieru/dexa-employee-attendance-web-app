import { randomUUID } from 'node:crypto';
import { DependencyUnavailableError, configureApp, parseConfig, ServiceName } from '@dexa/common';
import {
  ErrorCode,
  ProfileStatus,
  Role,
  employeeListPageSchema,
  type AccountLookupItem,
  type EmployeeListItem,
  type EmployeeListPage,
} from '@dexa/contracts';
import type { Database } from '@dexa/db';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { createAppModule } from '../src/app.module.js';
import {
  AUTH_ACCOUNT_CLIENT,
  type IAuthAccountClient,
} from '../src/auth-accounts/auth-account-client.interface.js';
import { EmployeeServiceConfigSchema } from '../src/config/employee-service-config.schema.js';
import { DATABASE } from '../src/infrastructure/db/database.token.js';
import {
  employees,
  masterEmployeeStatuses,
  masterPositions,
} from '../src/infrastructure/db/schema.js';
import type { AuthKeySet } from './auth-key-set.js';
import { signGatewayUserToken } from './gateway-user-token.js';
import {
  employeeServiceAuthKeys,
  employeeServiceEnvironment,
} from './employee-service-environment.js';

// Starting the container pulls an image on a cold machine, which exceeds Jest's 5 second default.
const CONTAINER_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 30_000;
const LIST_PATH = '/api/v1/employees';
const PHOTO_KEY = '3f1b2c4d-0a9e-4b8f-8c7d-6e5f4a3b2c1d.jpg';
const PHONE_NUMBER = '+6281234567890';
const LIST_ITEM_KEYS = [
  'accountId',
  'email',
  'employeeStatus',
  'name',
  'phoneNumber',
  'photoUrl',
  'position',
  'profileStatus',
  'role',
];

const SEED_DOCUMENT = {
  positions: [
    { code: 'HR_OFFICER', name: 'HR Officer' },
    { code: 'FULLSTACK_DEVELOPER', name: 'Fullstack Developer' },
  ],
  employeeStatuses: [
    { code: 'ACTIVE', name: 'Active' },
    { code: 'INACTIVE', name: 'Inactive' },
  ],
};

// The roster is fixed so each spec can name the employees it expects. Names are chosen so that their order
// does not depend on the database collation: the first letters already differ, or the names differ before the
// first space.
type RosterEntry = {
  readonly key: string;
  readonly name: string;
  readonly email: string;
  readonly positionCode: string;
  readonly employeeStatusCode: string;
  readonly role: Role;
  readonly hasAccount: boolean;
  readonly photoKey: string | null;
  readonly phoneNumber: string | null;
};

const ROSTER: ReadonlyArray<RosterEntry> = [
  entry('adi', 'Adi Pratama', 'adi.pratama@dexa.test', { photo: true, phone: true }),
  entry('bima', 'Bima Saputra', 'bima.saputra@dexa.test'),
  // The email holds "santoso" but the name does not, so an email-only match is possible.
  entry('budi', 'Budi Santoso', 'budi.s@dexa.test'),
  entry('dewi', 'Dewi Anggraini', 'dewi.santoso@dexa.test', { status: 'INACTIVE' }),
  // No Auth account exists for this employee, as when the account was never created or is still pending.
  entry('eka', 'Eka Wijaya', 'eka.wijaya@dexa.test', { hasAccount: false }),
  entry('gita', 'Gita 100% Kusuma', 'gita.kusuma@dexa.test'),
  entry('hadi', 'Hadi 1000 Kusuma', 'hadi.kusuma@dexa.test'),
  entry('sari', 'Sari Lestari', 'sari.lestari@dexa.test', {
    role: Role.HR,
    position: 'HR_OFFICER',
    photo: true,
    phone: true,
  }),
];

type EntryOptions = {
  readonly role?: Role;
  readonly position?: string;
  readonly status?: string;
  readonly hasAccount?: boolean;
  readonly photo?: boolean;
  readonly phone?: boolean;
};

function entry(key: string, name: string, email: string, options: EntryOptions = {}): RosterEntry {
  return {
    key,
    name,
    email,
    positionCode: options.position ?? 'FULLSTACK_DEVELOPER',
    employeeStatusCode: options.status ?? 'ACTIVE',
    role: options.role ?? Role.EMPLOYEE,
    hasAccount: options.hasAccount ?? true,
    photoKey: options.photo === true ? PHOTO_KEY : null,
    phoneNumber: options.phone === true ? PHONE_NUMBER : null,
  };
}

// Stands in for auth-service's lookups and search. Like the real routes, it answers only for known accounts,
// matches the search term as a case-insensitive substring of the email, and records every call so that a test
// can count them.
class FakeAuthAccountClient implements IAuthAccountClient {
  readonly lookupRequests: string[][] = [];
  readonly searchTerms: string[] = [];
  failLookups = false;
  failSearches = false;
  private readonly accounts = new Map<string, AccountLookupItem>();

  register(account: AccountLookupItem): void {
    this.accounts.set(account.id, account);
  }

  reset(): void {
    this.lookupRequests.length = 0;
    this.searchTerms.length = 0;
    this.failLookups = false;
    this.failSearches = false;
  }

  findAccountById(accountId: string): Promise<AccountLookupItem | undefined> {
    return this.lookupAccounts([accountId]).then((accounts) => accounts[0]);
  }

  lookupAccounts(accountIds: ReadonlyArray<string>): Promise<AccountLookupItem[]> {
    this.lookupRequests.push([...accountIds]);
    if (this.failLookups) return Promise.reject(authUnavailableError());
    return Promise.resolve(accountIds.flatMap((accountId) => this.accounts.get(accountId) ?? []));
  }

  findAccountReferenceByEmail(): Promise<undefined> {
    return Promise.resolve(undefined);
  }

  searchAccountIdsByEmail(term: string): Promise<string[]> {
    this.searchTerms.push(term);
    if (this.failSearches) return Promise.reject(authUnavailableError());
    const needle = term.toLowerCase();
    const matches = [...this.accounts.values()].filter((account) =>
      account.email.toLowerCase().includes(needle),
    );
    return Promise.resolve(matches.map((account) => account.id));
  }
}

function authUnavailableError(): DependencyUnavailableError {
  return new DependencyUnavailableError(ErrorCode.DEPENDENCY_UNAVAILABLE, 'Auth is unavailable.');
}

const fakeAuthAccountClient = new FakeAuthAccountClient();

// Signs the token that api-gateway sends to this service for the user.
function signUserToken(keys: AuthKeySet, accountId: string, role: Role): string {
  return signGatewayUserToken(keys, ServiceName.EMPLOYEE_SERVICE, accountId, role);
}

describe('employee-service HR employee list', () => {
  let container: StartedPostgreSqlContainer;
  let moduleRef: TestingModule;
  let app: INestApplication;
  let database: Database;
  let hrToken: string;
  let employeeToken: string;
  let accountIds: Map<string, string>;

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  }, CONTAINER_TIMEOUT_MS);

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18').start();
    const config = parseConfig(
      EmployeeServiceConfigSchema,
      employeeServiceEnvironment({
        EMPLOYEE_DATABASE_URL: container.getConnectionUri(),
        EMPLOYEE_MASTER_DATA: JSON.stringify(SEED_DOCUMENT),
      }),
    );
    moduleRef = await Test.createTestingModule({
      imports: [createAppModule(config)],
    })
      .overrideProvider(AUTH_ACCOUNT_CLIENT)
      .useValue(fakeAuthAccountClient)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app, { CORS_ORIGINS: [] });
    await app.init();
    database = moduleRef.get<Database>(DATABASE);

    accountIds = new Map();
    for (const rosterEntry of ROSTER) {
      const accountId = randomUUID();
      accountIds.set(rosterEntry.key, accountId);
      if (rosterEntry.hasAccount) {
        fakeAuthAccountClient.register({
          id: accountId,
          email: rosterEntry.email,
          role: rosterEntry.role,
        });
      }
      await insertEmployee(accountId, rosterEntry);
    }

    const keys = employeeServiceAuthKeys();
    const hrAccountId = accountIdFor('sari');
    const employeeAccountId = accountIdFor('adi');
    hrToken = signUserToken(keys, hrAccountId, Role.HR);
    employeeToken = signUserToken(keys, employeeAccountId, Role.EMPLOYEE);
  }, CONTAINER_TIMEOUT_MS);

  beforeEach(() => {
    fakeAuthAccountClient.reset();
  });

  function accountIdFor(key: string): string {
    const accountId = accountIds.get(key);
    if (accountId === undefined) throw new Error(`The roster has no employee ${key}.`);
    return accountId;
  }

  async function insertEmployee(accountId: string, rosterEntry: RosterEntry): Promise<void> {
    const [position] = await database.db
      .select({ id: masterPositions.id })
      .from(masterPositions)
      .where(eq(masterPositions.code, rosterEntry.positionCode));
    const [status] = await database.db
      .select({ id: masterEmployeeStatuses.id })
      .from(masterEmployeeStatuses)
      .where(eq(masterEmployeeStatuses.code, rosterEntry.employeeStatusCode));
    if (position === undefined || status === undefined) {
      throw new Error('The master seed did not insert the rows this test needs.');
    }
    const isComplete = rosterEntry.photoKey !== null && rosterEntry.phoneNumber !== null;
    await database.db.insert(employees).values({
      accountId,
      name: rosterEntry.name,
      positionId: position.id,
      employeeStatusId: status.id,
      profileStatus: isComplete ? ProfileStatus.COMPLETE : ProfileStatus.INCOMPLETE,
      phoneNumber: rosterEntry.phoneNumber,
      photoKey: rosterEntry.photoKey,
    });
  }

  function listEmployees(query: Record<string, string> = {}, accessToken = hrToken) {
    return request(app.getHttpServer())
      .get(LIST_PATH)
      .query(query)
      .set('Authorization', `Bearer ${accessToken}`);
  }

  async function listPage(query: Record<string, string> = {}): Promise<EmployeeListPage> {
    const response = await listEmployees(query).expect(200);
    return employeeListPageSchema.parse(response.body);
  }

  function namesOf(page: EmployeeListPage): string[] {
    return page.items.map((item) => item.name);
  }

  function itemNamed(page: EmployeeListPage, name: string): EmployeeListItem {
    const item = page.items.find((candidate) => candidate.name === name);
    if (item === undefined) throw new Error(`The page has no employee named ${name}.`);
    return item;
  }

  const ALL_NAMES_IN_ORDER = [
    'Adi Pratama',
    'Bima Saputra',
    'Budi Santoso',
    'Dewi Anggraini',
    'Eka Wijaya',
    'Gita 100% Kusuma',
    'Hadi 1000 Kusuma',
    'Sari Lestari',
  ];

  describe('pagination', () => {
    it(
      'should return the page with its paging fields and the total when page and pageSize are given',
      async () => {
        const page = await listPage({ page: '2', pageSize: '3' });

        expect(namesOf(page)).toEqual(['Dewi Anggraini', 'Eka Wijaya', 'Gita 100% Kusuma']);
        expect(page).toMatchObject({ page: 2, pageSize: 3, totalItems: 8, totalPages: 3 });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should order every employee by name when no search is given',
      async () => {
        const page = await listPage({ pageSize: '100' });

        expect(namesOf(page)).toEqual(ALL_NAMES_IN_ORDER);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return a short last page when the total does not fill it',
      async () => {
        const page = await listPage({ page: '3', pageSize: '3' });

        expect(namesOf(page)).toEqual(['Hadi 1000 Kusuma', 'Sari Lestari']);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return an empty page without a lookup when the page is past the end',
      async () => {
        fakeAuthAccountClient.reset();

        const page = await listPage({ page: '9', pageSize: '3' });

        expect(page).toMatchObject({ items: [], page: 9, totalItems: 8, totalPages: 3 });
        expect(fakeAuthAccountClient.lookupRequests).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );

    const invalidQueries: ReadonlyArray<{ condition: string; query: Record<string, string> }> = [
      { condition: 'pageSize is above the maximum', query: { pageSize: '101' } },
      { condition: 'page is 0', query: { page: '0' } },
      { condition: 'an unknown query key is present', query: { sort: 'name' } },
      { condition: 'the search term is longer than 254 characters', query: { q: 'a'.repeat(255) } },
    ];

    it.each(invalidQueries)(
      'should return 400 when $condition',
      async ({ query }) => {
        const response = await listEmployees(query).expect(400);

        expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
        expect(fakeAuthAccountClient.lookupRequests).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('search', () => {
    it(
      'should match the name case-insensitively',
      async () => {
        const page = await listPage({ q: 'SARI' });

        expect(namesOf(page)).toEqual(['Sari Lestari']);
        expect(page.totalItems).toBe(1);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should combine a name match with an email-only match before paginating',
      async () => {
        const page = await listPage({ q: 'santoso' });

        // Budi matches by name. Dewi matches only by email, which Auth resolved to an account ID.
        expect(namesOf(page)).toEqual(['Budi Santoso', 'Dewi Anggraini']);
        expect(page.totalItems).toBe(2);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should match an employee by email alone when the name does not contain the term',
      async () => {
        const page = await listPage({ q: 'budi.s@' });

        expect(namesOf(page)).toEqual(['Budi Santoso']);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should list an employee once when both the name and the email match',
      async () => {
        const page = await listPage({ q: 'kusuma' });

        expect(namesOf(page)).toEqual(['Gita 100% Kusuma', 'Hadi 1000 Kusuma']);
        expect(page.totalItems).toBe(2);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should treat % in the term as a literal character',
      async () => {
        const page = await listPage({ q: '100%' });

        // Unescaped, the pattern %100%% would also match "Hadi 1000 Kusuma".
        expect(namesOf(page)).toEqual(['Gita 100% Kusuma']);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should treat _ in the term as a literal character',
      async () => {
        const page = await listPage({ q: 'Budi_Santoso' });

        // Unescaped, the underscore would match the space in "Budi Santoso".
        expect(page.items).toEqual([]);
        expect(page.totalItems).toBe(0);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should make one search call and one lookup call for a search that returns a page',
      async () => {
        await listPage({ q: 'santoso' });

        expect(fakeAuthAccountClient.searchTerms).toEqual(['santoso']);
        expect(fakeAuthAccountClient.lookupRequests).toHaveLength(1);
        expect(fakeAuthAccountClient.lookupRequests[0]).toHaveLength(2);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should make one search call and no lookup call for a search that matches nothing',
      async () => {
        const page = await listPage({ q: 'no-such-employee' });

        expect(page.items).toEqual([]);
        expect(fakeAuthAccountClient.searchTerms).toEqual(['no-such-employee']);
        expect(fakeAuthAccountClient.lookupRequests).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 503 without a name-only answer when Auth cannot search',
      async () => {
        fakeAuthAccountClient.failSearches = true;

        const response = await listEmployees({ q: 'santoso' }).expect(503);

        expect(response.body).toMatchObject({ statusCode: 503, code: 'DEPENDENCY_UNAVAILABLE' });
        expect(fakeAuthAccountClient.lookupRequests).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should treat a blank search term as no search',
      async () => {
        const page = await listPage({ q: '   ' });

        expect(namesOf(page)).toEqual(ALL_NAMES_IN_ORDER);
        expect(fakeAuthAccountClient.searchTerms).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('roster contents and Auth data', () => {
    it(
      'should list HR accounts and INACTIVE employees with their own status',
      async () => {
        const page = await listPage({ pageSize: '100' });

        expect(itemNamed(page, 'Sari Lestari')).toMatchObject({
          role: Role.HR,
          position: { code: 'HR_OFFICER' },
        });
        expect(itemNamed(page, 'Dewi Anggraini').employeeStatus).toMatchObject({
          code: 'INACTIVE',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should make one lookup call for the whole page',
      async () => {
        await listPage({ pageSize: '3' });

        expect(fakeAuthAccountClient.lookupRequests).toHaveLength(1);
        expect(fakeAuthAccountClient.lookupRequests[0]).toHaveLength(3);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should show a null email and role for an account that Auth did not answer for',
      async () => {
        const page = await listPage({ pageSize: '100' });

        expect(itemNamed(page, 'Eka Wijaya')).toMatchObject({ email: null, role: null });
        expect(itemNamed(page, 'Adi Pratama')).toMatchObject({
          email: 'adi.pratama@dexa.test',
          role: Role.EMPLOYEE,
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return the page with null emails and roles when the account lookup is unavailable',
      async () => {
        fakeAuthAccountClient.failLookups = true;

        const page = await listPage({ pageSize: '100' });

        expect(namesOf(page)).toEqual(ALL_NAMES_IN_ORDER);
        expect(page.items.every((item) => item.email === null && item.role === null)).toBe(true);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should point photoUrl at the HR photo route only for employees with a photo',
      async () => {
        const page = await listPage({ pageSize: '100' });
        const accountId = accountIdFor('adi');

        expect(itemNamed(page, 'Adi Pratama').photoUrl).toBe(
          `/api/v1/employees/${accountId}/photo`,
        );
        expect(itemNamed(page, 'Bima Saputra').photoUrl).toBeNull();
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return exactly the list fields for each item and never the photo key',
      async () => {
        const response = await listEmployees({ pageSize: '100' }).expect(200);
        const body: unknown = response.body;
        const items = isRecordWithItems(body) ? body.items : [];

        expect(items).toHaveLength(ROSTER.length);
        for (const item of items) {
          expect(isRecord(item) ? Object.keys(item).sort() : []).toEqual(LIST_ITEM_KEYS);
        }
        expect(JSON.stringify(body)).not.toContain(PHOTO_KEY);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('access', () => {
    it(
      'should return 401 when no bearer token is sent',
      async () => {
        await request(app.getHttpServer()).get(LIST_PATH).expect(401);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 403 when an employee token lists employees, without a lookup or search',
      async () => {
        const response = await listEmployees({ q: 'santoso' }, employeeToken).expect(403);

        expect(response.body).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
        expect(fakeAuthAccountClient.searchTerms).toEqual([]);
        expect(fakeAuthAccountClient.lookupRequests).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );
  });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isRecordWithItems(value: unknown): value is { items: unknown[] } {
  return isRecord(value) && Array.isArray(value['items']);
}
