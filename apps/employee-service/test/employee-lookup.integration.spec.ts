import { Buffer } from 'node:buffer';
import { createSign, randomUUID } from 'node:crypto';
import { ServiceName, configureApp, parseConfig } from '@dexa/common';
import {
  EMPLOYEE_LOOKUP_MAX_IDS,
  employeeLookupResponseSchema,
  ProfileStatus,
  Role,
  type EmployeeLookupItem,
} from '@dexa/contracts';
import type { Database } from '@dexa/db';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { createAppModule } from '../src/app.module.js';
import { EmployeeServiceConfigSchema } from '../src/config/employee-service-config.schema.js';
import { DATABASE } from '../src/infrastructure/db/database.token.js';
import {
  employees,
  masterEmployeeStatuses,
  masterPositions,
} from '../src/infrastructure/db/schema.js';
import {
  USER_JWT_AUDIENCE,
  USER_JWT_ISSUER,
  servicePair,
  type AuthKeySet,
} from './auth-key-set.js';
import {
  employeeServiceAuthKeys,
  employeeServiceEnvironment,
} from './employee-service-environment.js';

// Starting the container pulls an image on a cold machine, which exceeds Jest's 5 second default.
const CONTAINER_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 30_000;
const LOOKUP_PATH = '/api/v1/internal/employees/lookup';
const TOKEN_LIFETIME_SECONDS = 300;
const ACTIVE_STATUS_CODE = 'ACTIVE';
const RETIRED_POSITION_CODE = 'DATA_ANALYST';

// The seed matches the master lookup spec. DATA_ANALYST is deactivated after the seed runs, so an
// employee assigned to it has a profile whose position is inactive.
const SEED_DOCUMENT = {
  positions: [
    { code: 'HR_OFFICER', name: 'HR Officer' },
    { code: 'FULLSTACK_DEVELOPER', name: 'Fullstack Developer' },
    { code: 'DATA_ANALYST', name: 'Data Analyst' },
  ],
  employeeStatuses: [
    { code: 'ON_LEAVE', name: 'On Leave' },
    { code: 'INACTIVE', name: 'Inactive' },
    { code: 'ACTIVE', name: 'Active' },
  ],
};

const UNKNOWN_ACCOUNT_ID = '00000000-0000-4000-8000-000000000000';
const UNAUTHORIZED_CODE = 'UNAUTHORIZED';
const VALIDATION_FAILED_CODE = 'VALIDATION_FAILED';

function encodeJsonSegment(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

// Signs a user token with the test user key. Only auth-service holds that key in production.
function signUserToken(
  keys: AuthKeySet,
  accountId: string,
  role: Role,
  expiresAtSeconds: number,
): string {
  const signingInput = [
    encodeJsonSegment({ alg: 'RS256', typ: 'JWT' }),
    encodeJsonSegment({
      sub: accountId,
      role,
      iss: USER_JWT_ISSUER,
      aud: USER_JWT_AUDIENCE,
      exp: expiresAtSeconds,
    }),
  ].join('.');
  const signature = createSign('RSA-SHA256')
    .update(signingInput)
    .sign(keys.user.privateKeyPem, 'base64url');
  return `${signingInput}.${signature}`;
}

// Signs a service token the way a calling service does: the caller's key, its name as kid, issuer, and
// subject, and the target as audience. ES256 signatures use the raw r||s encoding that JWS requires.
function signServiceToken(caller: ServiceName, target: ServiceName): string {
  const signingInput = [
    encodeJsonSegment({ alg: 'ES256', typ: 'JWT', kid: caller }),
    encodeJsonSegment({
      iss: caller,
      sub: caller,
      aud: target,
      exp: nowInSeconds() + TOKEN_LIFETIME_SECONDS,
    }),
  ].join('.');
  const signature = createSign('SHA256')
    .update(signingInput)
    .sign(
      {
        key: servicePair(employeeServiceAuthKeys(), caller).privateKeyPem,
        dsaEncoding: 'ieee-p1363',
      },
      'base64url',
    );
  return `${signingInput}.${signature}`;
}

function requireRow<TRow>(row: TRow | undefined): TRow {
  if (row === undefined) throw new Error('Expected a row, but the query returned none.');
  return row;
}

// The body is parsed with the contract first, so the account IDs are typed instead of read from `any`.
function accountIdsOf(body: unknown): string[] {
  return employeeLookupResponseSchema.parse(body).map((item: EmployeeLookupItem) => item.accountId);
}

describe('employee lookup by account ID', () => {
  let container: StartedPostgreSqlContainer;
  let moduleRef: TestingModule;
  let app: INestApplication;
  let database: Database;
  let gatewayToken: string;
  let hrToken: string;
  let nadiaAccountId: string;
  let bimaAccountId: string;
  let retiredAccountId: string;

  // Teardown still stops the container when setup failed partway through.
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
    moduleRef = await Test.createTestingModule({ imports: [createAppModule(config)] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, { CORS_ORIGINS: [] });
    await app.init();

    database = moduleRef.get<Database>(DATABASE);
    nadiaAccountId = randomUUID();
    bimaAccountId = randomUUID();
    retiredAccountId = randomUUID();
    await insertEmployee(nadiaAccountId, 'Nadia Rahma', 'FULLSTACK_DEVELOPER');
    await insertEmployee(bimaAccountId, 'Bima Saputra', 'HR_OFFICER');
    // The insert trigger refuses a new assignment to an inactive position, but an existing profile keeps
    // its position after deactivation, so the retired profile is inserted before the position is deactivated.
    await insertEmployee(retiredAccountId, 'Dewi Kartika', RETIRED_POSITION_CODE);
    await database.db
      .update(masterPositions)
      .set({ isActive: false })
      .where(eq(masterPositions.code, RETIRED_POSITION_CODE));

    gatewayToken = signServiceToken(ServiceName.API_GATEWAY, ServiceName.EMPLOYEE_SERVICE);
    const expiresLater = nowInSeconds() + TOKEN_LIFETIME_SECONDS;
    hrToken = signUserToken(employeeServiceAuthKeys(), randomUUID(), Role.HR, expiresLater);
  }, CONTAINER_TIMEOUT_MS);

  async function insertEmployee(
    accountId: string,
    name: string,
    positionCode: string,
  ): Promise<void> {
    const [position] = await database.db
      .select({ id: masterPositions.id })
      .from(masterPositions)
      .where(eq(masterPositions.code, positionCode));
    const [status] = await database.db
      .select({ id: masterEmployeeStatuses.id })
      .from(masterEmployeeStatuses)
      .where(eq(masterEmployeeStatuses.code, ACTIVE_STATUS_CODE));
    const positionId = requireRow(position).id;
    const employeeStatusId = requireRow(status).id;
    await database.db.insert(employees).values({
      accountId,
      name,
      positionId,
      employeeStatusId,
      profileStatus: ProfileStatus.INCOMPLETE,
    });
  }

  function postLookup(accountIds: unknown, serviceToken: string = gatewayToken) {
    return request(app.getHttpServer())
      .post(LOOKUP_PATH)
      .set('Authorization', `Bearer ${serviceToken}`)
      .send({ accountIds });
  }

  it(
    'should return the name and position name of each employee when the account IDs are known',
    async () => {
      const response = await postLookup([nadiaAccountId, bimaAccountId]).expect(200);

      expect(employeeLookupResponseSchema.parse(response.body)).toEqual(
        expect.arrayContaining([
          { accountId: nadiaAccountId, name: 'Nadia Rahma', positionName: 'Fullstack Developer' },
          { accountId: bimaAccountId, name: 'Bima Saputra', positionName: 'HR Officer' },
        ]),
      );
      expect(response.body).toHaveLength(2);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return the employee with the inactive position name when the position was deactivated',
    async () => {
      const response = await postLookup([retiredAccountId]).expect(200);

      expect(response.body).toEqual([
        { accountId: retiredAccountId, name: 'Dewi Kartika', positionName: 'Data Analyst' },
      ]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should omit the ID without an error when no employee has the ID',
    async () => {
      const response = await postLookup([UNKNOWN_ACCOUNT_ID]).expect(200);

      expect(response.body).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return only the known employees when the request mixes known and unknown IDs',
    async () => {
      const response = await postLookup([nadiaAccountId, UNKNOWN_ACCOUNT_ID, bimaAccountId]).expect(
        200,
      );

      expect(response.body).toHaveLength(2);
      expect(response.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ accountId: nadiaAccountId }),
          expect.objectContaining({ accountId: bimaAccountId }),
        ]),
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return one item per employee when the request repeats an ID',
    async () => {
      const response = await postLookup([nadiaAccountId, nadiaAccountId, bimaAccountId]).expect(
        200,
      );

      const accountIds = accountIdsOf(response.body);
      expect(accountIds).toEqual([nadiaAccountId, bimaAccountId].sort());
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should order the items by account ID when the request lists the IDs in another order',
    async () => {
      const response = await postLookup([retiredAccountId, bimaAccountId, nadiaAccountId]).expect(
        200,
      );

      const accountIds = accountIdsOf(response.body);
      expect(accountIds).toEqual([nadiaAccountId, bimaAccountId, retiredAccountId].sort());
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return only accountId, name, and positionName of each item',
    async () => {
      const response = await postLookup([nadiaAccountId]).expect(200);

      for (const item of response.body as Array<Record<string, unknown>>) {
        expect(Object.keys(item).sort()).toEqual(['accountId', 'name', 'positionName']);
      }
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 200 when the request carries the maximum number of IDs',
    async () => {
      const accountIds = [
        nadiaAccountId,
        ...Array.from({ length: EMPLOYEE_LOOKUP_MAX_IDS - 1 }, () => randomUUID()),
      ];

      const response = await postLookup(accountIds).expect(200);

      expect(response.body).toHaveLength(1);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 400 VALIDATION_FAILED when the request carries more IDs than the maximum',
    async () => {
      const accountIds = Array.from({ length: EMPLOYEE_LOOKUP_MAX_IDS + 1 }, () => randomUUID());

      const response = await postLookup(accountIds).expect(400);

      expect(response.body).toMatchObject({ statusCode: 400, code: VALIDATION_FAILED_CODE });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 400 VALIDATION_FAILED when the account ID list is empty',
    async () => {
      const response = await postLookup([]).expect(400);

      expect(response.body).toMatchObject({ statusCode: 400, code: VALIDATION_FAILED_CODE });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 when the request has no token',
    async () => {
      const response = await request(app.getHttpServer())
        .post(LOOKUP_PATH)
        .send({ accountIds: [nadiaAccountId] })
        .expect(401);

      expect(response.body).toMatchObject({ statusCode: 401, code: UNAUTHORIZED_CODE });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 when the caller sends an HR user token',
    async () => {
      const response = await postLookup([nadiaAccountId], hrToken).expect(401);

      expect(response.body).toMatchObject({ statusCode: 401, code: UNAUTHORIZED_CODE });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 when the service token is addressed to another service',
    async () => {
      const wrongAudienceToken = signServiceToken(
        ServiceName.API_GATEWAY,
        ServiceName.AUTH_SERVICE,
      );

      const response = await postLookup([nadiaAccountId], wrongAudienceToken).expect(401);

      expect(response.body).toMatchObject({ statusCode: 401, code: UNAUTHORIZED_CODE });
    },
    TEST_TIMEOUT_MS,
  );
});
