import { randomUUID } from 'node:crypto';
import { CLOCK, configureApp, parseConfig, type IClock, ServiceName } from '@dexa/common';
import { attendanceSummaryPageSchema, Role } from '@dexa/contracts';
import type { Database } from '@dexa/db';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { createAppModule } from '../src/app.module.js';
import { AttendanceServiceConfigSchema } from '../src/config/attendance-service-config.schema.js';
import { DATABASE } from '../src/infrastructure/db/database.token.js';
import { workCalendarDates } from '../src/infrastructure/db/schema.js';
import type { AuthKeySet } from './auth-key-set.js';
import { signGatewayUserToken } from './gateway-user-token.js';
import {
  attendanceServiceAuthKeys,
  attendanceServiceEnvironment,
} from './attendance-service-environment.js';
import { CONTAINER_TIMEOUT_MS, TEST_TIMEOUT_MS, createEmptyDatabaseUri } from './test-database.js';

// The lifetime of the token api-gateway sends for a call (D-51).
const TOKEN_LIFETIME_SECONDS = 60;

const SUMMARY_PATH = '/api/v1/attendance/me';
const CLOCK_IN_PATH = '/api/v1/attendance/clock-in';
const CLOCK_OUT_PATH = '/api/v1/attendance/clock-out';
// The default schedule is seeded from the first start, so the seed takes effect on this Monday (WIB).
const FIRST_START_INSTANT = new Date('2026-11-02T01:00:00Z');
const MONDAY = '2026-11-02';
const TUESDAY = '2026-11-03';
const WEDNESDAY_HOLIDAY = '2026-11-04';
const THURSDAY = '2026-11-05';
// Working-day instants in UTC: 09:00 WIB is 02:00Z, and the 15-minute late grace ends at 02:15Z; 18:00 WIB is 11:00Z.
const MONDAY_LATE_CHECKIN_INSTANT = new Date('2026-11-02T02:30:00Z');
const MONDAY_ON_TIME_CHECKOUT_INSTANT = new Date('2026-11-02T11:00:00Z');
const TUESDAY_ON_TIME_CHECKIN_INSTANT = new Date('2026-11-03T02:05:00Z');
const WEDNESDAY_HOLIDAY_INSTANT = new Date('2026-11-04T02:00:00Z');
const THURSDAY_ON_TIME_CHECKIN_INSTANT = new Date('2026-11-05T02:00:00Z');
const THURSDAY_ON_TIME_CHECKOUT_INSTANT = new Date('2026-11-05T11:00:00Z');
const OTHER_ACCOUNT_TUESDAY_INSTANT = new Date('2026-11-03T03:00:00Z');
// 10:00 WIB on Tuesday, the 3rd: the default range is 1 Nov through 3 Nov.
const TUESDAY_MORNING_INSTANT = new Date('2026-11-03T03:00:00Z');

// Stands in for auth-service. The clock is shared across tests, so each test sets the instant it needs.
const mutableClock: { current: Date } = { current: FIRST_START_INSTANT };
const fixedClock: IClock = { now: () => new Date(mutableClock.current) };

let container: StartedPostgreSqlContainer;
let app: INestApplication;
let database: Database;
let keys: AuthKeySet;

// Signs the token that api-gateway sends to this service for the user (D-51).
function signUserToken(accountId: string, role: Role, expiresAtSeconds: number): string {
  return signGatewayUserToken(
    keys,
    ServiceName.ATTENDANCE_SERVICE,
    accountId,
    role,
    expiresAtSeconds,
  );
}

function tokenFor(accountId: string, role: Role = Role.EMPLOYEE): string {
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECONDS;
  return signUserToken(accountId, role, expiresAt);
}

function registerAccount(): string {
  const accountId = randomUUID();
  return accountId;
}

function getSummary(accessToken: string | undefined, query: Record<string, string> = {}) {
  const pending = request(app.getHttpServer()).get(SUMMARY_PATH).query(query);
  if (accessToken !== undefined) pending.set('Authorization', `Bearer ${accessToken}`);
  return pending;
}

async function punchAs(accountId: string, punchPath: string, instant: Date): Promise<void> {
  mutableClock.current = instant;
  await request(app.getHttpServer())
    .post(punchPath)
    .set('Authorization', `Bearer ${tokenFor(accountId)}`)
    .expect(201);
}

async function startApp(databaseUrl: string): Promise<INestApplication> {
  const config = parseConfig(
    AttendanceServiceConfigSchema,
    attendanceServiceEnvironment({ ATTENDANCE_DATABASE_URL: databaseUrl }),
  );
  const moduleRef = await Test.createTestingModule({ imports: [createAppModule(config)] })
    .overrideProvider(CLOCK)
    .useValue(fixedClock)
    .compile();
  const nestApp = moduleRef.createNestApplication();
  configureApp(nestApp, { CORS_ORIGINS: [] });
  await nestApp.init();
  database = moduleRef.get<Database>(DATABASE);
  return nestApp;
}

// Seeds through the real punch endpoints, so the days carry the same snapshots and classifications as production.
// The employee's days are Monday to Thursday, with Monday and Thursday worked out, Tuesday check-in only, and
// Wednesday a holiday with a punch. The other employee has one day on Tuesday, which the employee must never see.
async function seedDays(employeeId: string, otherEmployeeId: string): Promise<void> {
  await punchAs(employeeId, CLOCK_IN_PATH, MONDAY_LATE_CHECKIN_INSTANT);
  await punchAs(employeeId, CLOCK_OUT_PATH, MONDAY_ON_TIME_CHECKOUT_INSTANT);
  await punchAs(employeeId, CLOCK_IN_PATH, TUESDAY_ON_TIME_CHECKIN_INSTANT);
  await punchAs(otherEmployeeId, CLOCK_IN_PATH, OTHER_ACCOUNT_TUESDAY_INSTANT);
  await database.db.insert(workCalendarDates).values({
    businessDate: WEDNESDAY_HOLIDAY,
    isWorkingDay: false,
    description: 'Test holiday',
  });
  await punchAs(employeeId, CLOCK_IN_PATH, WEDNESDAY_HOLIDAY_INSTANT);
  await punchAs(employeeId, CLOCK_IN_PATH, THURSDAY_ON_TIME_CHECKIN_INSTANT);
  await punchAs(employeeId, CLOCK_OUT_PATH, THURSDAY_ON_TIME_CHECKOUT_INSTANT);
}

describe('attendance own summary', () => {
  let employeeId: string;
  let otherEmployeeId: string;

  beforeAll(async () => {
    keys = attendanceServiceAuthKeys();
    container = await new PostgreSqlContainer('postgres:18').start();
    const databaseUrl = await createEmptyDatabaseUri(container.getConnectionUri());
    app = await startApp(databaseUrl);
    employeeId = registerAccount();
    otherEmployeeId = registerAccount();
    await seedDays(employeeId, otherEmployeeId);
  }, CONTAINER_TIMEOUT_MS);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  }, CONTAINER_TIMEOUT_MS);

  beforeEach(() => {
    mutableClock.current = FIRST_START_INSTANT;
  });

  it(
    'should return only the days inside the range when the employee gives from and to',
    async () => {
      const response = await getSummary(tokenFor(employeeId), {
        from: TUESDAY,
        to: WEDNESDAY_HOLIDAY,
      }).expect(200);

      const page = attendanceSummaryPageSchema.parse(response.body);
      expect(page.items.map((item) => item.businessDate)).toEqual([WEDNESDAY_HOLIDAY, TUESDAY]);
      expect(page.totalItems).toBe(2);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should list the days newest first when the range covers several days',
    async () => {
      const response = await getSummary(tokenFor(employeeId), {
        from: MONDAY,
        to: THURSDAY,
      }).expect(200);

      const page = attendanceSummaryPageSchema.parse(response.body);
      expect(page.items.map((item) => item.businessDate)).toEqual([
        THURSDAY,
        WEDNESDAY_HOLIDAY,
        TUESDAY,
        MONDAY,
      ]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return only the caller days when another employee has a day in the same range',
    async () => {
      const response = await getSummary(tokenFor(employeeId), {
        from: MONDAY,
        to: THURSDAY,
      }).expect(200);
      const otherResponse = await getSummary(tokenFor(otherEmployeeId), {
        from: MONDAY,
        to: THURSDAY,
      }).expect(200);

      const page = attendanceSummaryPageSchema.parse(response.body);
      const otherPage = attendanceSummaryPageSchema.parse(otherResponse.body);
      expect(page.totalItems).toBe(4);
      expect(page.items.map((item) => item.clockInAt)).not.toContain(
        OTHER_ACCOUNT_TUESDAY_INSTANT.toISOString(),
      );
      expect(otherPage.items).toEqual([
        expect.objectContaining({
          businessDate: TUESDAY,
          clockInAt: OTHER_ACCOUNT_TUESDAY_INSTANT.toISOString(),
        }),
      ]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should split the days into pages and report the total when the page size is smaller than the days',
    async () => {
      const firstResponse = await getSummary(tokenFor(employeeId), {
        from: MONDAY,
        to: THURSDAY,
        page: '1',
        pageSize: '3',
      }).expect(200);
      const secondResponse = await getSummary(tokenFor(employeeId), {
        from: MONDAY,
        to: THURSDAY,
        page: '2',
        pageSize: '3',
      }).expect(200);

      const firstPage = attendanceSummaryPageSchema.parse(firstResponse.body);
      const secondPage = attendanceSummaryPageSchema.parse(secondResponse.body);
      expect(firstPage).toMatchObject({ page: 1, pageSize: 3, totalItems: 4, totalPages: 2 });
      expect(firstPage.items.map((item) => item.businessDate)).toEqual([
        THURSDAY,
        WEDNESDAY_HOLIDAY,
        TUESDAY,
      ]);
      expect(secondPage.items.map((item) => item.businessDate)).toEqual([MONDAY]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should show no check-out and a pending status when the day has only a check-in',
    async () => {
      const response = await getSummary(tokenFor(employeeId), {
        from: TUESDAY,
        to: TUESDAY,
      }).expect(200);

      const page = attendanceSummaryPageSchema.parse(response.body);
      expect(page.items).toEqual([
        {
          businessDate: TUESDAY,
          clockInAt: TUESDAY_ON_TIME_CHECKIN_INSTANT.toISOString(),
          clockInStatus: 'ON_TIME_CHECKIN',
          clockOutAt: null,
          clockOutStatus: 'PENDING_CHECKOUT',
        },
      ]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should show the stored classifications for worked days and for a holiday with a punch',
    async () => {
      const response = await getSummary(tokenFor(employeeId), {
        from: MONDAY,
        to: THURSDAY,
      }).expect(200);

      const page = attendanceSummaryPageSchema.parse(response.body);
      expect(page.items).toEqual([
        {
          businessDate: THURSDAY,
          clockInAt: THURSDAY_ON_TIME_CHECKIN_INSTANT.toISOString(),
          clockInStatus: 'ON_TIME_CHECKIN',
          clockOutAt: THURSDAY_ON_TIME_CHECKOUT_INSTANT.toISOString(),
          clockOutStatus: 'ON_TIME_CHECKOUT',
        },
        {
          businessDate: WEDNESDAY_HOLIDAY,
          clockInAt: WEDNESDAY_HOLIDAY_INSTANT.toISOString(),
          clockInStatus: 'CHECKIN_NOT_REQUIRED',
          clockOutAt: null,
          clockOutStatus: 'CHECKOUT_NOT_REQUIRED',
        },
        expect.objectContaining({ businessDate: TUESDAY, clockInStatus: 'ON_TIME_CHECKIN' }),
        {
          businessDate: MONDAY,
          clockInAt: MONDAY_LATE_CHECKIN_INSTANT.toISOString(),
          clockInStatus: 'LATE_CHECKIN',
          clockOutAt: MONDAY_ON_TIME_CHECKOUT_INSTANT.toISOString(),
          clockOutStatus: 'ON_TIME_CHECKOUT',
        },
      ]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should default the range to the first of the WIB month through today when no range is given',
    async () => {
      mutableClock.current = TUESDAY_MORNING_INSTANT;

      const response = await getSummary(tokenFor(employeeId)).expect(200);

      const page = attendanceSummaryPageSchema.parse(response.body);
      expect(page.items.map((item) => item.businessDate)).toEqual([TUESDAY, MONDAY]);
      expect(page).toMatchObject({ page: 1, pageSize: 20, totalItems: 2, totalPages: 1 });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 400 VALIDATION_FAILED when from is after to',
    async () => {
      const response = await getSummary(tokenFor(employeeId), {
        from: THURSDAY,
        to: MONDAY,
      }).expect(400);

      expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 400 VALIDATION_FAILED when the defaulted to is before the given from',
    async () => {
      mutableClock.current = TUESDAY_MORNING_INSTANT;

      const response = await getSummary(tokenFor(employeeId), { from: '2026-12-01' }).expect(400);

      expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 400 VALIDATION_FAILED when the page size is above the maximum',
    async () => {
      const response = await getSummary(tokenFor(employeeId), { pageSize: '101' }).expect(400);

      expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 when the request has no bearer token',
    async () => {
      await getSummary(undefined, { from: MONDAY, to: THURSDAY }).expect(401);
    },
    TEST_TIMEOUT_MS,
  );
});
