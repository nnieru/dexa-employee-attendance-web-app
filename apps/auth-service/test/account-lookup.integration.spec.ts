import { ServiceName, configureApp, parseConfig } from '@dexa/common';
import { ACCOUNT_LOOKUP_MAX_IDS, ACCOUNT_SEARCH_MAX_IDS } from '@dexa/contracts';
import type { Database } from '@dexa/db';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createAppModule } from '../src/app.module.js';
import { AuthServiceConfigSchema } from '../src/config/auth-service-config.schema.js';
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

// Starting the container pulls an image on a cold machine, which exceeds Jest's 5 second default.
const CONTAINER_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 30_000;
const LOOKUP_PATH = '/api/v1/internal/accounts/lookup';
const HR_RECIPIENTS_PATH = '/api/v1/internal/accounts/hr-recipients';
const SEARCH_PATH = '/api/v1/internal/accounts/search';
const BY_EMAIL_PATH = '/api/v1/internal/accounts/by-email';
const SERVICE_TOKEN_LIFETIME_SECONDS = 60;
const BULK_ACCOUNT_COUNT = 120;
const BULK_EMAIL_PREFIX = 'bulk.member';

const HR_BOOTSTRAP_EMAIL = 'hr.admin@dexa.test';
const HR_BOOTSTRAP_PASSWORD = 'hr-admin-pass-1';
const EMPLOYEE_EMAIL = 'nadia.rahma@dexa.test';
const PENDING_EMAIL = 'pending.employee@dexa.test';
const MIXED_CASE_EMAIL = 'Mixed.Case.Employee@dexa.test';
const HR_ACTIVE_EMAIL = 'hr.active@dexa.test';
const HR_INACTIVE_EMAIL = 'hr.inactive@dexa.test';
const HR_PENDING_EMAIL = 'hr.pending@dexa.test';
const INACTIVE_EMAIL = 'inactive.employee@dexa.test';
const PROBE_PERCENT_EMAIL = 'probe%percent@dexa.test';
const PROBE_UNDERSCORE_EMAIL = 'probe_under@dexa.test';
const PROBE_LOOKALIKE_PERCENT_EMAIL = 'probeXpercent@dexa.test';
const PROBE_LOOKALIKE_UNDERSCORE_EMAIL = 'probeXunder@dexa.test';
const PROBE_BACKSLASH_EMAIL = 'probe\\slash@dexa.test';
const PROBE_LOOKALIKE_BACKSLASH_EMAIL = 'probeXslash@dexa.test';

// Seeded rows never sign in, so they carry a fixed dummy hash instead of an argon2 hash.
const DUMMY_PASSWORD_HASH = '$argon2id$v=19$m=19456,t=2,p=1$not-verified$not-verified';
const UNKNOWN_ACCOUNT_ID = '00000000-0000-4000-8000-000000000000';

const UNAUTHORIZED_BODY = { statusCode: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' };
const VALIDATION_FAILED_CODE = 'VALIDATION_FAILED';
const NOT_FOUND_BODY = { statusCode: 404, code: 'NOT_FOUND' };

const jwtService = new JwtService();
// Generated once for the file. The keys are only as valid as the config needs.
const TEST_KEYS: AuthKeySet = generateAuthKeySet();

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

function requireRow<TRow>(row: TRow | undefined): TRow {
  if (row === undefined) throw new Error('Expected a row, but the query returned none.');
  return row;
}

type SeededAccount = {
  readonly id: string;
  readonly companyEmail: string;
};

describe('internal account lookups', () => {
  let container: StartedPostgreSqlContainer;
  let moduleRef: TestingModule;
  let app: INestApplication;
  let database: Database;
  let gatewayToken: string;
  let employeeServiceToken: string;
  let hrBootstrapId: string;
  let employee: SeededAccount;
  let mixedCaseEmployee: SeededAccount;
  let inactiveEmployee: SeededAccount;
  let pendingEmployee: SeededAccount;
  let activeHr: SeededAccount;
  let inactiveHr: SeededAccount;
  let pendingHr: SeededAccount;
  let probePercent: SeededAccount;
  let probeUnderscore: SeededAccount;
  let probeBackslash: SeededAccount;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18').start();
    const config = parseConfig(
      AuthServiceConfigSchema,
      authServiceEnvironment(TEST_KEYS, {
        AUTH_DATABASE_URL: container.getConnectionUri(),
        AUTH_BOOTSTRAP_HR_EMAIL: HR_BOOTSTRAP_EMAIL,
        AUTH_BOOTSTRAP_HR_PASSWORD: HR_BOOTSTRAP_PASSWORD,
      }),
    );
    moduleRef = await Test.createTestingModule({ imports: [createAppModule(config)] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, { CORS_ORIGINS: [] });
    await app.init();

    database = moduleRef.get<Database>(DATABASE);
    await seedAccounts();
    await seedBulkAccounts();
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
    readonly roleCode: string;
    readonly isActive?: boolean;
  }): Promise<SeededAccount> {
    const rows = await database.db
      .insert(accounts)
      .values({
        companyEmail: options.email,
        passwordHash: DUMMY_PASSWORD_HASH,
        roleId: await findRoleId(options.roleCode),
        isActive: options.isActive ?? true,
      })
      .returning({ id: accounts.id, companyEmail: accounts.companyEmail });
    return requireRow(rows[0]);
  }

  async function markPendingProvisioning(accountId: string): Promise<void> {
    const hrRows = await database.db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.companyEmail, HR_BOOTSTRAP_EMAIL));
    await database.db.insert(accountProvisioningOperations).values({
      operationId: randomUUID(),
      accountId,
      actorAccountId: requireRow(hrRows[0]).id,
      requestedEmail: 'pending-provisioning@dexa.test',
      requestedRole: 'EMPLOYEE',
      initialPasswordHash: DUMMY_PASSWORD_HASH,
      status: 'PENDING',
    });
  }

  async function seedAccounts(): Promise<void> {
    const hrRows = await database.db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.companyEmail, HR_BOOTSTRAP_EMAIL));
    hrBootstrapId = requireRow(hrRows[0]).id;

    employee = await insertAccount({ email: EMPLOYEE_EMAIL, roleCode: 'EMPLOYEE' });
    mixedCaseEmployee = await insertAccount({ email: MIXED_CASE_EMAIL, roleCode: 'EMPLOYEE' });
    inactiveEmployee = await insertAccount({
      email: INACTIVE_EMAIL,
      roleCode: 'EMPLOYEE',
      isActive: false,
    });
    pendingEmployee = await insertAccount({ email: PENDING_EMAIL, roleCode: 'EMPLOYEE' });
    await markPendingProvisioning(pendingEmployee.id);
    activeHr = await insertAccount({ email: HR_ACTIVE_EMAIL, roleCode: 'HR' });
    inactiveHr = await insertAccount({
      email: HR_INACTIVE_EMAIL,
      roleCode: 'HR',
      isActive: false,
    });
    pendingHr = await insertAccount({ email: HR_PENDING_EMAIL, roleCode: 'HR' });
    await markPendingProvisioning(pendingHr.id);
    probePercent = await insertAccount({ email: PROBE_PERCENT_EMAIL, roleCode: 'EMPLOYEE' });
    await insertAccount({ email: PROBE_LOOKALIKE_PERCENT_EMAIL, roleCode: 'EMPLOYEE' });
    probeUnderscore = await insertAccount({ email: PROBE_UNDERSCORE_EMAIL, roleCode: 'EMPLOYEE' });
    await insertAccount({ email: PROBE_LOOKALIKE_UNDERSCORE_EMAIL, roleCode: 'EMPLOYEE' });
    probeBackslash = await insertAccount({ email: PROBE_BACKSLASH_EMAIL, roleCode: 'EMPLOYEE' });
    await insertAccount({ email: PROBE_LOOKALIKE_BACKSLASH_EMAIL, roleCode: 'EMPLOYEE' });
  }

  // One batch of more matching accounts than the search may return, inserted directly.
  async function seedBulkAccounts(): Promise<void> {
    const roleId = await findRoleId('EMPLOYEE');
    const rows = Array.from({ length: BULK_ACCOUNT_COUNT }, (_, index) => ({
      companyEmail: `${BULK_EMAIL_PREFIX}.${index}@dexa.test`,
      passwordHash: DUMMY_PASSWORD_HASH,
      roleId,
      isActive: true,
    }));
    await database.db.insert(accounts).values(rows);
  }

  function postLookup(ids: unknown, serviceToken: string = gatewayToken) {
    return request(app.getHttpServer())
      .post(LOOKUP_PATH)
      .set('Authorization', `Bearer ${serviceToken}`)
      .send({ ids });
  }

  function getInternal(path: string, serviceToken: string = gatewayToken) {
    return request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${serviceToken}`);
  }

  describe('POST /api/v1/internal/accounts/lookup', () => {
    it(
      'should return the email and role of each known account when the IDs are known',
      async () => {
        const response = await postLookup([employee.id, hrBootstrapId]).expect(200);

        expect(response.body).toEqual(
          expect.arrayContaining([
            { id: employee.id, email: EMPLOYEE_EMAIL, role: 'EMPLOYEE' },
            { id: hrBootstrapId, email: HR_BOOTSTRAP_EMAIL, role: 'HR' },
          ]),
        );
        expect(response.body).toHaveLength(2);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should omit the ID without an error when the ID is unknown',
      async () => {
        const response = await postLookup([employee.id, UNKNOWN_ACCOUNT_ID]).expect(200);

        expect(response.body).toEqual([
          { id: employee.id, email: EMPLOYEE_EMAIL, role: 'EMPLOYEE' },
        ]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should omit the ID when its provisioning is still PENDING',
      async () => {
        const response = await postLookup([pendingEmployee.id]).expect(200);

        expect(response.body).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 400 VALIDATION_FAILED when the request carries more IDs than the maximum',
      async () => {
        const ids = Array.from({ length: ACCOUNT_LOOKUP_MAX_IDS + 1 }, () => randomUUID());

        const response = await postLookup(ids).expect(400);

        expect(response.body).toMatchObject({ statusCode: 400, code: VALIDATION_FAILED_CODE });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 401 when the request has no service token',
      async () => {
        const response = await request(app.getHttpServer())
          .post(LOOKUP_PATH)
          .send({ ids: [employee.id] })
          .expect(401);

        expect(response.body).toEqual(UNAUTHORIZED_BODY);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 401 when the service token is addressed to another service',
      async () => {
        const wrongAudienceToken = await signServiceToken(
          ServiceName.API_GATEWAY,
          ServiceName.EMPLOYEE_SERVICE,
        );

        const response = await postLookup([employee.id], wrongAudienceToken).expect(401);

        expect(response.body).toEqual(UNAUTHORIZED_BODY);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 200 when a service other than the gateway calls with a token addressed to auth-service',
      async () => {
        const response = await postLookup([employee.id], employeeServiceToken).expect(200);

        expect(response.body).toEqual([
          { id: employee.id, email: EMPLOYEE_EMAIL, role: 'EMPLOYEE' },
        ]);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('GET /api/v1/internal/accounts/hr-recipients', () => {
    it(
      'should list only the active HR accounts that are not PENDING when the page is requested',
      async () => {
        const response = await getInternal(`${HR_RECIPIENTS_PATH}?pageSize=100`).expect(200);

        expect(response.body.items).toEqual(expect.arrayContaining([hrBootstrapId, activeHr.id]));
        expect(response.body.items).not.toContain(inactiveHr.id);
        expect(response.body.items).not.toContain(pendingHr.id);
        expect(response.body.items).not.toContain(employee.id);
        expect(response.body.totalItems).toBe(2);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return pagination fields and ascending IDs across pages when pageSize is 1',
      async () => {
        const firstPage = await getInternal(`${HR_RECIPIENTS_PATH}?page=1&pageSize=1`).expect(200);
        const secondPage = await getInternal(`${HR_RECIPIENTS_PATH}?page=2&pageSize=1`).expect(200);
        const beyondLastPage = await getInternal(`${HR_RECIPIENTS_PATH}?page=3&pageSize=1`).expect(
          200,
        );

        const expectedIds = [hrBootstrapId, activeHr.id].sort();
        expect(firstPage.body).toEqual({
          items: [expectedIds[0]],
          page: 1,
          pageSize: 1,
          totalItems: 2,
          totalPages: 2,
        });
        expect(secondPage.body).toMatchObject({
          items: [expectedIds[1]],
          page: 2,
          totalItems: 2,
          totalPages: 2,
        });
        expect(beyondLastPage.body).toEqual({
          items: [],
          page: 3,
          pageSize: 1,
          totalItems: 2,
          totalPages: 2,
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 400 when pageSize exceeds the maximum page size',
      async () => {
        await getInternal(`${HR_RECIPIENTS_PATH}?pageSize=101`).expect(400);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('GET /api/v1/internal/accounts/:id/status', () => {
    it(
      'should return isActive true when the account is active',
      async () => {
        const response = await getInternal(
          `/api/v1/internal/accounts/${employee.id}/status`,
        ).expect(200);

        expect(response.body).toEqual({ isActive: true });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return isActive false when the account is inactive',
      async () => {
        const response = await getInternal(
          `/api/v1/internal/accounts/${inactiveEmployee.id}/status`,
        ).expect(200);

        expect(response.body).toEqual({ isActive: false });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 404 NOT_FOUND when no account has the ID',
      async () => {
        const response = await getInternal(
          `/api/v1/internal/accounts/${UNKNOWN_ACCOUNT_ID}/status`,
        ).expect(404);

        expect(response.body).toMatchObject(NOT_FOUND_BODY);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 400 when the ID is not a UUID',
      async () => {
        const response = await getInternal('/api/v1/internal/accounts/not-a-uuid/status').expect(
          400,
        );

        expect(response.body).toMatchObject({ statusCode: 400, code: VALIDATION_FAILED_CODE });
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('GET /api/v1/internal/accounts/search', () => {
    it(
      'should return the matching account ID when the term differs from the email only by letter case',
      async () => {
        const response = await getInternal(`${SEARCH_PATH}?email=MIXED.case.EMPLOYEE`).expect(200);

        expect(response.body).toEqual({ ids: [mixedCaseEmployee.id] });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should match only the literal percent sign when the term contains a percent sign',
      async () => {
        const response = await getInternal(
          `${SEARCH_PATH}?email=${encodeURIComponent('probe%')}`,
        ).expect(200);

        expect(response.body).toEqual({ ids: [probePercent.id] });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should match only the literal underscore when the term contains an underscore',
      async () => {
        const response = await getInternal(
          `${SEARCH_PATH}?email=${encodeURIComponent('probe_')}`,
        ).expect(200);

        expect(response.body).toEqual({ ids: [probeUnderscore.id] });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should match only the literal backslash when the term contains a backslash',
      async () => {
        const response = await getInternal(
          `${SEARCH_PATH}?email=${encodeURIComponent('probe\\')}`,
        ).expect(200);

        expect(response.body).toEqual({ ids: [probeBackslash.id] });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return at most 100 IDs in ascending order when more accounts match the term',
      async () => {
        const response = await getInternal(`${SEARCH_PATH}?email=${BULK_EMAIL_PREFIX}`).expect(200);

        expect(response.body.ids).toHaveLength(ACCOUNT_SEARCH_MAX_IDS);
        expect(response.body.ids).toEqual([...response.body.ids].sort());
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 400 when the term is empty after trimming',
      async () => {
        const response = await getInternal(`${SEARCH_PATH}?email=%20%20`).expect(400);

        expect(response.body).toMatchObject({ statusCode: 400, code: VALIDATION_FAILED_CODE });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 400 when the term parameter is missing',
      async () => {
        await getInternal(SEARCH_PATH).expect(400);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('GET /api/v1/internal/accounts/by-email', () => {
    it(
      'should return the ID and role when the email differs from the stored email only by letter case',
      async () => {
        const response = await getInternal(
          `${BY_EMAIL_PATH}?email=${encodeURIComponent('MIXED.case.employee@DEXA.test')}`,
        ).expect(200);

        expect(response.body).toEqual({ id: mixedCaseEmployee.id, role: 'EMPLOYEE' });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 404 NOT_FOUND when no account uses the email',
      async () => {
        const response = await getInternal(`${BY_EMAIL_PATH}?email=nobody@dexa.test`).expect(404);

        expect(response.body).toMatchObject(NOT_FOUND_BODY);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 404 NOT_FOUND when the account with the email is still PENDING',
      async () => {
        await getInternal(`${BY_EMAIL_PATH}?email=${PENDING_EMAIL}`).expect(404);
      },
      TEST_TIMEOUT_MS,
    );
  });
});
