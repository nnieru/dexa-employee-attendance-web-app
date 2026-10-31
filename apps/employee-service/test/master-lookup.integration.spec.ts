import { randomUUID } from 'node:crypto';
import { configureApp, parseConfig, ServiceName } from '@dexa/common';
import { masterOptionListSchema, Role, type MasterOption } from '@dexa/contracts';
import type { Database } from '@dexa/db';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { createAppModule } from '../src/app.module.js';
import { EmployeeServiceConfigSchema } from '../src/config/employee-service-config.schema.js';
import { DATABASE } from '../src/infrastructure/db/database.token.js';
import { masterEmployeeStatuses, masterPositions } from '../src/infrastructure/db/schema.js';
import type { AuthKeySet } from './auth-key-set.js';
import {
  forgeGatewayUserToken,
  signEndUserJwt,
  signGatewayUserToken,
} from './gateway-user-token.js';
import {
  employeeServiceAuthKeys,
  employeeServiceEnvironment,
} from './employee-service-environment.js';

// The lifetime of the token api-gateway sends for a call (D-51).
const TOKEN_LIFETIME_SECONDS = 60;

// Starting the container pulls an image on a cold machine, which exceeds Jest's 5 second default.
const CONTAINER_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 30_000;
const POSITIONS_PATH = '/api/v1/positions';
const EMPLOYEE_STATUSES_PATH = '/api/v1/employee-statuses';

// The seed lists the rows out of code order, and each catalog has one inactive row. The expected lists
// below therefore show both the code ordering and the inclusion of inactive rows.
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
const INACTIVE_POSITION_CODE = 'DATA_ANALYST';
const INACTIVE_STATUS_CODE = 'ON_LEAVE';

const EXPECTED_POSITIONS = [
  { code: 'DATA_ANALYST', name: 'Data Analyst', isActive: false },
  { code: 'FULLSTACK_DEVELOPER', name: 'Fullstack Developer', isActive: true },
  { code: 'HR_OFFICER', name: 'HR Officer', isActive: true },
];
const EXPECTED_EMPLOYEE_STATUSES = [
  { code: 'ACTIVE', name: 'Active', isActive: true },
  { code: 'INACTIVE', name: 'Inactive', isActive: true },
  { code: 'ON_LEAVE', name: 'On Leave', isActive: false },
];

// Signs the token that api-gateway sends to this service for the user (D-51). The claims are the ones the
// service's guard checks.
function signUserToken(
  keys: AuthKeySet,
  accountId: string,
  role: Role,
  expiresAtSeconds: number,
): string {
  return signGatewayUserToken(
    keys,
    ServiceName.EMPLOYEE_SERVICE,
    accountId,
    role,
    expiresAtSeconds,
  );
}

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

// The ids come from the database, so the comparison checks the other three fields exactly.
function withoutIds(rows: ReadonlyArray<MasterOption>): Array<Omit<MasterOption, 'id'>> {
  return rows.map(({ code, name, isActive }) => ({ code, name, isActive }));
}

describe('employee-service master lookups', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let hrToken: string;
  let employeeToken: string;
  let expiredHrToken: string;

  // Teardown still stops each resource when setup failed partway through.
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
    const moduleRef = await Test.createTestingModule({
      imports: [createAppModule(config)],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, { CORS_ORIGINS: [] });
    await app.init();
    await deactivateMasterRows(moduleRef.get<Database>(DATABASE));

    const keys = employeeServiceAuthKeys();
    const expiresLater = nowInSeconds() + TOKEN_LIFETIME_SECONDS;
    const hrAccountId = randomUUID();
    const employeeAccountId = randomUUID();
    hrToken = signUserToken(keys, hrAccountId, Role.HR, expiresLater);
    employeeToken = signUserToken(keys, employeeAccountId, Role.EMPLOYEE, expiresLater);
    expiredHrToken = signUserToken(keys, hrAccountId, Role.HR, nowInSeconds() - 60);
  }, CONTAINER_TIMEOUT_MS);

  async function deactivateMasterRows(database: Database): Promise<void> {
    await database.db
      .update(masterPositions)
      .set({ isActive: false })
      .where(eq(masterPositions.code, INACTIVE_POSITION_CODE));
    await database.db
      .update(masterEmployeeStatuses)
      .set({ isActive: false })
      .where(eq(masterEmployeeStatuses.code, INACTIVE_STATUS_CODE));
  }

  function getWithToken(path: string, accessToken: string) {
    return request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${accessToken}`);
  }

  it(
    'should return every position, active and inactive, ordered by code when an HR token is sent',
    async () => {
      const response = await getWithToken(POSITIONS_PATH, hrToken).expect(200);

      expect(withoutIds(masterOptionListSchema.parse(response.body))).toEqual(EXPECTED_POSITIONS);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return every employee status, active and inactive, ordered by code when an HR token is sent',
    async () => {
      const response = await getWithToken(EMPLOYEE_STATUSES_PATH, hrToken).expect(200);

      expect(withoutIds(masterOptionListSchema.parse(response.body))).toEqual(
        EXPECTED_EMPLOYEE_STATUSES,
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return only the id, code, name, and isActive fields of each row',
    async () => {
      const response = await getWithToken(POSITIONS_PATH, hrToken).expect(200);

      for (const row of response.body as Array<Record<string, unknown>>) {
        expect(Object.keys(row).sort()).toEqual(['code', 'id', 'isActive', 'name']);
      }
    },
    TEST_TIMEOUT_MS,
  );

  it.each([POSITIONS_PATH, EMPLOYEE_STATUSES_PATH])(
    'should return 403 FORBIDDEN on %s when an employee token is sent',
    async (path) => {
      const response = await getWithToken(path, employeeToken).expect(403);

      expect(response.body).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    },
    TEST_TIMEOUT_MS,
  );

  // Only api-gateway verifies end-user tokens and the account status (D-51), so these routes refuse anything else.
  it.each([POSITIONS_PATH, EMPLOYEE_STATUSES_PATH])(
    'should return 401 UNAUTHORIZED on %s when an end-user JWT is sent instead of a gateway token',
    async (path) => {
      const endUserJwt = signEndUserJwt(employeeServiceAuthKeys(), randomUUID(), Role.HR);

      const response = await getWithToken(path, endUserJwt).expect(401);

      expect(response.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    },
    TEST_TIMEOUT_MS,
  );

  it.each([POSITIONS_PATH, EMPLOYEE_STATUSES_PATH])(
    'should return 401 UNAUTHORIZED on %s when a token names api-gateway but another service key signs it',
    async (path) => {
      const forged = forgeGatewayUserToken(
        employeeServiceAuthKeys(),
        ServiceName.EMPLOYEE_SERVICE,
        randomUUID(),
        Role.HR,
      );

      const response = await getWithToken(path, forged).expect(401);

      expect(response.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    },
    TEST_TIMEOUT_MS,
  );

  it.each([POSITIONS_PATH, EMPLOYEE_STATUSES_PATH])(
    'should return 401 UNAUTHORIZED on %s when no bearer token is sent',
    async (path) => {
      const response = await request(app.getHttpServer()).get(path).expect(401);

      expect(response.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 UNAUTHORIZED on the positions list when the bearer token is not a JWT',
    async () => {
      const response = await getWithToken(POSITIONS_PATH, 'not-a-user-token').expect(401);

      expect(response.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 UNAUTHORIZED on the employee statuses list when the HR token has expired',
    async () => {
      const response = await getWithToken(EMPLOYEE_STATUSES_PATH, expiredHrToken).expect(401);

      expect(response.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    },
    TEST_TIMEOUT_MS,
  );
});
