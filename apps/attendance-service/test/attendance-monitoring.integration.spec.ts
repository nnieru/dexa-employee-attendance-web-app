import { randomUUID } from 'node:crypto';
import { CLOCK, configureApp, parseConfig, type IClock, ServiceName } from '@dexa/common';
import { attendanceMonitoringPageSchema, Role, type EmployeeLookupItem } from '@dexa/contracts';
import type { Database } from '@dexa/db';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { createAppModule } from '../src/app.module.js';
import { AttendanceServiceConfigSchema } from '../src/config/attendance-service-config.schema.js';
import {
  EMPLOYEE_CLIENT,
  type IEmployeeClient,
} from '../src/employees/employee-client.interface.js';
import { DATABASE } from '../src/infrastructure/db/database.token.js';
import { workCalendarDates } from '../src/infrastructure/db/schema.js';
import type { AuthKeySet } from './auth-key-set.js';
import { signGatewayUserToken } from './gateway-user-token.js';
import {
  attendanceServiceAuthKeys,
  attendanceServiceEnvironment,
} from './attendance-service-environment.js';
import { CONTAINER_TIMEOUT_MS, TEST_TIMEOUT_MS, createEmptyDatabaseUri } from './test-database.js';

// The lifetime of the token api-gateway sends for a call.
const TOKEN_LIFETIME_SECONDS = 60;

const MONITORING_PATH = '/api/v1/attendance';
const CLOCK_IN_PATH = '/api/v1/attendance/clock-in';
const CLOCK_OUT_PATH = '/api/v1/attendance/clock-out';
// The default schedule is seeded from the first start, so the seed takes effect on this Monday (WIB).
const FIRST_START_INSTANT = new Date('2026-11-02T01:00:00Z');
const MONDAY = '2026-11-02';
const TUESDAY = '2026-11-03';
const WEDNESDAY_HOLIDAY = '2026-11-04';
const THURSDAY = '2026-11-05';
const FAR_FUTURE_MONTH_START = '2030-01-01';
const FAR_FUTURE_MONTH_END = '2030-01-31';
const OVERTIME_PATH = '/api/v1/overtime-requests';
// A request creates a day with no punch. The request dates are a working Friday and the Saturday after.
const FRIDAY_REQUEST_DATE = '2026-11-06';
const SATURDAY_REQUEST_DATE = '2026-11-07';
// Overtime cannot name a date after today, so each request is made on its own business date, at 10:00 WIB.
const FRIDAY_REQUEST_SUBMITTED_INSTANT = new Date('2026-11-06T03:00:00Z');
const SATURDAY_REQUEST_SUBMITTED_INSTANT = new Date('2026-11-07T03:00:00Z');
// Working-day instants in UTC: 09:00 WIB is 02:00Z, and the 15-minute late grace ends at 02:15Z; 18:00 WIB is 11:00Z.
const MONDAY_LATE_CHECKIN_INSTANT = new Date('2026-11-02T02:30:00Z');
const MONDAY_ON_TIME_CHECKOUT_INSTANT = new Date('2026-11-02T11:00:00Z');
const TUESDAY_ON_TIME_CHECKIN_INSTANT = new Date('2026-11-03T02:05:00Z');
const TUESDAY_HR_CHECKIN_INSTANT = new Date('2026-11-03T02:10:00Z');
const TUESDAY_UNKNOWN_CHECKIN_INSTANT = new Date('2026-11-03T03:00:00Z');
const WEDNESDAY_HOLIDAY_INSTANT = new Date('2026-11-04T02:00:00Z');
const THURSDAY_ON_TIME_CHECKIN_INSTANT = new Date('2026-11-05T02:00:00Z');
const THURSDAY_ON_TIME_CHECKOUT_INSTANT = new Date('2026-11-05T11:00:00Z');

const EMPLOYEE_PROFILE = { name: 'Dewi Anggraini', positionName: 'Engineer' };
const HR_PROFILE = { name: 'Sari Lestari', positionName: 'HR Staff' };

// Stands in for auth-service. The clock is shared across tests, so each test sets the instant it needs.
const mutableClock: { current: Date } = { current: FIRST_START_INSTANT };
const fixedClock: IClock = { now: () => new Date(mutableClock.current) };

// Stands in for employee-service. It knows only the accounts placed in employeeProfiles, and records every lookup so
// a test can count the calls made for one page.
const employeeProfiles = new Map<string, EmployeeLookupItem>();
const recordedLookups: string[][] = [];
const recordingEmployeeClient: IEmployeeClient = {
  lookupEmployees: (accountIds) => {
    recordedLookups.push([...accountIds]);
    const profiles = accountIds.flatMap((accountId) => {
      const profile = employeeProfiles.get(accountId);
      return profile === undefined ? [] : [profile];
    });
    return Promise.resolve(profiles);
  },
};

let container: StartedPostgreSqlContainer;
let app: INestApplication;
let database: Database;
let keys: AuthKeySet;

// Signs the token that api-gateway sends to this service for the user.
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

function listAttendance(accessToken: string | undefined, query: Record<string, string> = {}) {
  const pending = request(app.getHttpServer()).get(MONITORING_PATH).query(query);
  if (accessToken !== undefined) pending.set('Authorization', `Bearer ${accessToken}`);
  return pending;
}

async function punchAs(
  accountId: string,
  role: Role,
  punchPath: string,
  instant: Date,
): Promise<void> {
  mutableClock.current = instant;
  await request(app.getHttpServer())
    .post(punchPath)
    .set('Authorization', `Bearer ${tokenFor(accountId, role)}`)
    .expect(201);
}

// Makes a day through the overtime endpoint, the request path that creates a day with no punch.
async function requestOvertimeAs(
  accountId: string,
  businessDate: string,
  submittedInstant: Date,
): Promise<void> {
  mutableClock.current = submittedInstant;
  await request(app.getHttpServer())
    .post(OVERTIME_PATH)
    .set('Authorization', `Bearer ${tokenFor(accountId)}`)
    .send({
      businessDate,
      startAt: `${businessDate}T18:00:00+07:00`,
      endAt: `${businessDate}T20:00:00+07:00`,
      reason: 'Release deployment',
      idempotencyKey: randomUUID(),
    })
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
    .overrideProvider(EMPLOYEE_CLIENT)
    .useValue(recordingEmployeeClient)
    .compile();
  const nestApp = moduleRef.createNestApplication();
  configureApp(nestApp, { CORS_ORIGINS: [] });
  await nestApp.init();
  database = moduleRef.get<Database>(DATABASE);
  return nestApp;
}

// Seeds through the real punch endpoints, so the days carry the same snapshots and classifications as production.
// The employee (with a profile) has Monday to Thursday; the profile-less employee and HR each have one Tuesday day.
async function seedDays(
  employeeId: string,
  profileLessEmployeeId: string,
  hrId: string,
): Promise<void> {
  await punchAs(employeeId, Role.EMPLOYEE, CLOCK_IN_PATH, MONDAY_LATE_CHECKIN_INSTANT);
  await punchAs(employeeId, Role.EMPLOYEE, CLOCK_OUT_PATH, MONDAY_ON_TIME_CHECKOUT_INSTANT);
  await punchAs(employeeId, Role.EMPLOYEE, CLOCK_IN_PATH, TUESDAY_ON_TIME_CHECKIN_INSTANT);
  await punchAs(
    profileLessEmployeeId,
    Role.EMPLOYEE,
    CLOCK_IN_PATH,
    TUESDAY_UNKNOWN_CHECKIN_INSTANT,
  );
  await punchAs(hrId, Role.HR, CLOCK_IN_PATH, TUESDAY_HR_CHECKIN_INSTANT);
  await database.db.insert(workCalendarDates).values({
    businessDate: WEDNESDAY_HOLIDAY,
    isWorkingDay: false,
    description: 'Test holiday',
  });
  await punchAs(employeeId, Role.EMPLOYEE, CLOCK_IN_PATH, WEDNESDAY_HOLIDAY_INSTANT);
  await punchAs(employeeId, Role.EMPLOYEE, CLOCK_IN_PATH, THURSDAY_ON_TIME_CHECKIN_INSTANT);
  await punchAs(employeeId, Role.EMPLOYEE, CLOCK_OUT_PATH, THURSDAY_ON_TIME_CHECKOUT_INSTANT);
}

describe('attendance monitoring list', () => {
  let employeeId: string;
  let profileLessEmployeeId: string;
  let hrId: string;

  // The rows of MONDAY through THURSDAY, newest date first, then account ID ascending within a date.
  function expectedRowOrder(): Array<{ businessDate: string; accountId: string }> {
    const tuesdayRows = [employeeId, profileLessEmployeeId, hrId]
      .sort()
      .map((accountId) => ({ businessDate: TUESDAY, accountId }));
    return [
      { businessDate: THURSDAY, accountId: employeeId },
      { businessDate: WEDNESDAY_HOLIDAY, accountId: employeeId },
      ...tuesdayRows,
      { businessDate: MONDAY, accountId: employeeId },
    ];
  }

  beforeAll(async () => {
    keys = attendanceServiceAuthKeys();
    container = await new PostgreSqlContainer('postgres:18').start();
    const databaseUrl = await createEmptyDatabaseUri(container.getConnectionUri());
    app = await startApp(databaseUrl);
    employeeId = registerAccount();
    profileLessEmployeeId = registerAccount();
    hrId = registerAccount();
    employeeProfiles.set(employeeId, { accountId: employeeId, ...EMPLOYEE_PROFILE });
    employeeProfiles.set(hrId, { accountId: hrId, ...HR_PROFILE });
    await seedDays(employeeId, profileLessEmployeeId, hrId);
  }, CONTAINER_TIMEOUT_MS);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  }, CONTAINER_TIMEOUT_MS);

  beforeEach(() => {
    mutableClock.current = FIRST_START_INSTANT;
    recordedLookups.length = 0;
  });

  it(
    'should list every account including HR own days, newest date first then account ID',
    async () => {
      const response = await listAttendance(tokenFor(hrId, Role.HR), {
        from: MONDAY,
        to: THURSDAY,
      }).expect(200);

      const page = attendanceMonitoringPageSchema.parse(response.body);
      expect(page.totalItems).toBe(6);
      expect(
        page.items.map((item) => ({ businessDate: item.businessDate, accountId: item.accountId })),
      ).toEqual(expectedRowOrder());
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return only the days inside the range when HR gives from and to',
    async () => {
      const response = await listAttendance(tokenFor(hrId, Role.HR), {
        from: TUESDAY,
        to: WEDNESDAY_HOLIDAY,
      }).expect(200);

      const page = attendanceMonitoringPageSchema.parse(response.body);
      expect(page.totalItems).toBe(4);
      expect(page.items.map((item) => item.businessDate)).toEqual([
        WEDNESDAY_HOLIDAY,
        TUESDAY,
        TUESDAY,
        TUESDAY,
      ]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return only the days of one account when HR gives employeeId',
    async () => {
      const response = await listAttendance(tokenFor(hrId, Role.HR), {
        from: MONDAY,
        to: THURSDAY,
        employeeId,
      }).expect(200);

      const page = attendanceMonitoringPageSchema.parse(response.body);
      expect(page.totalItems).toBe(4);
      expect(page.items.map((item) => item.accountId)).toEqual([
        employeeId,
        employeeId,
        employeeId,
        employeeId,
      ]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return HR own days when HR gives its own account as employeeId',
    async () => {
      const response = await listAttendance(tokenFor(hrId, Role.HR), {
        from: MONDAY,
        to: THURSDAY,
        employeeId: hrId,
      }).expect(200);

      const page = attendanceMonitoringPageSchema.parse(response.body);
      expect(page.items).toEqual([
        expect.objectContaining({
          accountId: hrId,
          businessDate: TUESDAY,
          employee: HR_PROFILE,
          clockInStatus: 'ON_TIME_CHECKIN',
        }),
      ]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should split the rows into pages and report the total when the page size is smaller than the rows',
    async () => {
      const firstResponse = await listAttendance(tokenFor(hrId, Role.HR), {
        from: MONDAY,
        to: THURSDAY,
        page: '1',
        pageSize: '4',
      }).expect(200);
      const secondResponse = await listAttendance(tokenFor(hrId, Role.HR), {
        from: MONDAY,
        to: THURSDAY,
        page: '2',
        pageSize: '4',
      }).expect(200);

      const firstPage = attendanceMonitoringPageSchema.parse(firstResponse.body);
      const secondPage = attendanceMonitoringPageSchema.parse(secondResponse.body);
      expect(firstPage).toMatchObject({ page: 1, pageSize: 4, totalItems: 6, totalPages: 2 });
      expect(secondPage).toMatchObject({ page: 2, pageSize: 4, totalItems: 6, totalPages: 2 });
      const pagedRows = [...firstPage.items, ...secondPage.items].map((item) => ({
        businessDate: item.businessDate,
        accountId: item.accountId,
      }));
      expect(pagedRows).toEqual(expectedRowOrder());
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should resolve names with one lookup of the distinct accounts on the page',
    async () => {
      await listAttendance(tokenFor(hrId, Role.HR), {
        from: MONDAY,
        to: THURSDAY,
        page: '1',
        pageSize: '6',
      }).expect(200);

      expect(recordedLookups).toHaveLength(1);
      expect([...(recordedLookups[0] ?? [])].sort()).toEqual(
        [employeeId, profileLessEmployeeId, hrId].sort(),
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should make no lookup when the page has no rows',
    async () => {
      const response = await listAttendance(tokenFor(hrId, Role.HR), {
        from: FAR_FUTURE_MONTH_START,
        to: FAR_FUTURE_MONTH_END,
      }).expect(200);

      const page = attendanceMonitoringPageSchema.parse(response.body);
      expect(page).toMatchObject({ items: [], totalItems: 0, totalPages: 0 });
      expect(recordedLookups).toHaveLength(0);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should show the name and position of a known account and unavailable for an unknown one',
    async () => {
      const response = await listAttendance(tokenFor(hrId, Role.HR), {
        from: TUESDAY,
        to: TUESDAY,
      }).expect(200);

      const page = attendanceMonitoringPageSchema.parse(response.body);
      const knownRow = page.items.find((item) => item.accountId === employeeId);
      const unknownRow = page.items.find((item) => item.accountId === profileLessEmployeeId);
      expect(knownRow?.employee).toEqual(EMPLOYEE_PROFILE);
      expect(unknownRow).toEqual(
        expect.objectContaining({
          businessDate: TUESDAY,
          accountId: profileLessEmployeeId,
          employee: null,
          clockInAt: TUESDAY_UNKNOWN_CHECKIN_INSTANT.toISOString(),
        }),
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 403 when an employee token lists attendance',
    async () => {
      await listAttendance(tokenFor(employeeId, Role.EMPLOYEE), {
        from: MONDAY,
        to: THURSDAY,
      }).expect(403);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should list request-created days with an empty clock-in time and their stored statuses',
    async () => {
      const requesterId = registerAccount();
      employeeProfiles.set(requesterId, {
        accountId: requesterId,
        name: 'Rama Putra',
        positionName: 'QA Analyst',
      });
      await requestOvertimeAs(requesterId, FRIDAY_REQUEST_DATE, FRIDAY_REQUEST_SUBMITTED_INSTANT);
      await requestOvertimeAs(
        requesterId,
        SATURDAY_REQUEST_DATE,
        SATURDAY_REQUEST_SUBMITTED_INSTANT,
      );

      const response = await listAttendance(tokenFor(hrId, Role.HR), {
        from: FRIDAY_REQUEST_DATE,
        to: SATURDAY_REQUEST_DATE,
        employeeId: requesterId,
      }).expect(200);

      const page = attendanceMonitoringPageSchema.parse(response.body);
      expect(page.items).toEqual([
        {
          accountId: requesterId,
          employee: { name: 'Rama Putra', positionName: 'QA Analyst' },
          businessDate: SATURDAY_REQUEST_DATE,
          dayStatus: 'DAY_OFF',
          approvedOvertimeMinutes: 0,
          rawClockInAt: null,
          rawClockOutAt: null,
          isCorrected: false,
          clockInAt: null,
          clockInStatus: 'CHECKIN_NOT_REQUIRED',
          clockOutAt: null,
          clockOutStatus: 'CHECKOUT_NOT_REQUIRED',
        },
        {
          accountId: requesterId,
          employee: { name: 'Rama Putra', positionName: 'QA Analyst' },
          businessDate: FRIDAY_REQUEST_DATE,
          dayStatus: 'PENDING',
          approvedOvertimeMinutes: 0,
          rawClockInAt: null,
          rawClockOutAt: null,
          isCorrected: false,
          clockInAt: null,
          clockInStatus: 'PENDING_CHECKIN',
          clockOutAt: null,
          clockOutStatus: 'PENDING_CHECKOUT',
        },
      ]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 when the request has no bearer token',
    async () => {
      await listAttendance(undefined, { from: MONDAY, to: THURSDAY }).expect(401);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 400 VALIDATION_FAILED when from is after to',
    async () => {
      const response = await listAttendance(tokenFor(hrId, Role.HR), {
        from: THURSDAY,
        to: MONDAY,
      }).expect(400);

      expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 404 when HR patches an attendance record path',
    async () => {
      await request(app.getHttpServer())
        .patch(`${MONITORING_PATH}/${randomUUID()}`)
        .set('Authorization', `Bearer ${tokenFor(hrId, Role.HR)}`)
        .send({})
        .expect(404);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 404 when HR deletes an attendance record path',
    async () => {
      await request(app.getHttpServer())
        .delete(`${MONITORING_PATH}/${randomUUID()}`)
        .set('Authorization', `Bearer ${tokenFor(hrId, Role.HR)}`)
        .expect(404);
    },
    TEST_TIMEOUT_MS,
  );
});
