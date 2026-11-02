import { randomUUID } from 'node:crypto';
import { CLOCK, configureApp, parseConfig, ServiceName, type IClock } from '@dexa/common';
import {
  correctionRequestReviewPageSchema,
  overtimeRequestReviewPageSchema,
  Role,
  type EmployeeLookupItem,
  type RequestStatus,
} from '@dexa/contracts';
import type { Database } from '@dexa/db';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { createAppModule } from '../src/app.module.js';
import { AttendanceServiceConfigSchema } from '../src/config/attendance-service-config.schema.js';
import {
  EMPLOYEE_CLIENT,
  type IEmployeeClient,
} from '../src/employees/employee-client.interface.js';
import { DATABASE } from '../src/infrastructure/db/database.token.js';
import { attendanceAdjustmentRequests, overtimeRequests } from '../src/infrastructure/db/schema.js';
import type { AuthKeySet } from './auth-key-set.js';
import {
  attendanceServiceAuthKeys,
  attendanceServiceEnvironment,
} from './attendance-service-environment.js';
import { signGatewayUserToken } from './gateway-user-token.js';
import { CONTAINER_TIMEOUT_MS, TEST_TIMEOUT_MS, createEmptyDatabaseUri } from './test-database.js';

const TOKEN_LIFETIME_SECONDS = 60;
const OVERTIME_PATH = '/api/v1/overtime-requests';
const CORRECTION_PATH = '/api/v1/attendance-corrections';
const CLOCK_IN_PATH = '/api/v1/attendance/clock-in';
const CLOCK_OUT_PATH = '/api/v1/attendance/clock-out';
// The default schedule takes effect on Monday 2026-11-02 (WIB), so the working days below are all scheduled.
const SCHEDULE_START_MOMENT = new Date('2026-11-02T01:00:00Z');
const MONDAY = '2026-11-02';
const TUESDAY = '2026-11-03';
const WEDNESDAY = '2026-11-04';
const FRIDAY = '2026-11-06';
const FAR_FUTURE_DATE = '2030-01-01';
// Friday 10:00 WIB. Every date above is in the past, inside the 7-day overtime window and the 30-day correction window.
const REVIEW_MOMENT = new Date('2026-11-06T03:00:00Z');
// 09:05 WIB and 18:10 WIB on Monday, in UTC.
const MONDAY_CLOCK_IN_INSTANT = new Date('2026-11-02T02:05:00Z');
const MONDAY_CLOCK_OUT_INSTANT = new Date('2026-11-02T11:10:00Z');
const mutableClock: { current: Date } = { current: SCHEDULE_START_MOMENT };
const fixedClock: IClock = { now: () => new Date(mutableClock.current) };

const EMPLOYEE_PROFILE = { name: 'Dewi Anggraini', positionName: 'Engineer' };
const HR_PROFILE = { name: 'Sari Lestari', positionName: 'HR Staff' };

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

function tokenFor(accountId: string, role: Role = Role.EMPLOYEE): string {
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECONDS;
  return signGatewayUserToken(keys, ServiceName.ATTENDANCE_SERVICE, accountId, role, expiresAt);
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

// An evening overtime on one business date, between the given WIB clock times (HH:MM). Submitted at the review moment.
async function submitOvertime(
  accountId: string,
  role: Role,
  businessDate: string,
  startTime: string,
  endTime: string,
): Promise<string> {
  mutableClock.current = REVIEW_MOMENT;
  const response = await request(app.getHttpServer())
    .post(OVERTIME_PATH)
    .set('Authorization', `Bearer ${tokenFor(accountId, role)}`)
    .send({
      businessDate,
      startAt: `${businessDate}T${startTime}:00+07:00`,
      endAt: `${businessDate}T${endTime}:00+07:00`,
      reason: `Release work for ${businessDate}`,
      idempotencyKey: randomUUID(),
    })
    .expect(201);
  return response.body.id;
}

// A correction body for the given outcome. The times are WIB clock times on the business date, for PRESENT only.
async function submitCorrection(
  accountId: string,
  role: Role,
  body: Record<string, string>,
): Promise<string> {
  mutableClock.current = REVIEW_MOMENT;
  const response = await request(app.getHttpServer())
    .post(CORRECTION_PATH)
    .set('Authorization', `Bearer ${tokenFor(accountId, role)}`)
    .send({ ...body, reason: `Correction on ${body.businessDate}`, idempotencyKey: randomUUID() })
    .expect(201);
  return response.body.id;
}

// HR decides a request in the database, as the decision endpoints are not built yet (T-REQ-08, T-REQ-09). The reviewer
// is a different account, so the constraints hold.
async function decideOvertime(
  requestId: string,
  status: Exclude<RequestStatus, 'PENDING'>,
  reviewReason: string | null,
): Promise<void> {
  await database.db
    .update(overtimeRequests)
    .set({
      status,
      reviewedByAccountId: randomUUID(),
      reviewedAt: sql`now()`,
      reviewReason,
    })
    .where(eq(overtimeRequests.id, requestId));
}

async function decideCorrection(
  requestId: string,
  status: Exclude<RequestStatus, 'PENDING'>,
  reviewReason: string | null,
): Promise<void> {
  await database.db
    .update(attendanceAdjustmentRequests)
    .set({
      status,
      reviewedByAccountId: randomUUID(),
      reviewedAt: sql`now()`,
      reviewReason,
      appliedRevision: status === 'APPROVED' ? 1 : null,
    })
    .where(eq(attendanceAdjustmentRequests.id, requestId));
}

function getQueue(
  path: string,
  accessToken: string | undefined,
  query: Record<string, string> = {},
) {
  const pending = request(app.getHttpServer()).get(path).query(query);
  if (accessToken !== undefined) pending.set('Authorization', `Bearer ${accessToken}`);
  return pending;
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

// The request IDs in the order they were created, so a test can assert the oldest-first order.
type SeededRequests = {
  readonly overtimeApprovedMonday: string;
  readonly overtimeRejectedTuesday: string;
  readonly overtimePendingMondayOfB: string;
  readonly overtimePendingMondayOfA: string;
  readonly overtimePendingMondayOfHr: string;
  readonly overtimePendingWednesdayOfA: string;
  readonly overtimePendingFridayOfB: string;
  readonly correctionPresentMondayOfA: string;
  readonly correctionLeaveTuesdayOfB: string;
  readonly correctionSickWednesdayOfA: string;
  readonly correctionPresentTuesdayOfHr: string;
  readonly correctionApprovedThursdayOfA: string;
  readonly correctionRejectedFridayOfB: string;
};

const ACCOUNTS = {
  hr: randomUUID(),
  employee: randomUUID(),
  profileLessEmployee: randomUUID(),
};

// Seeds through the real endpoints, so the days carry the same snapshots as production. Decisions are written in the
// database, as the decision endpoints are not built yet.
async function seedRequests(): Promise<SeededRequests> {
  const { hr, employee, profileLessEmployee } = ACCOUNTS;
  await punchAs(employee, Role.EMPLOYEE, CLOCK_IN_PATH, MONDAY_CLOCK_IN_INSTANT);
  await punchAs(employee, Role.EMPLOYEE, CLOCK_OUT_PATH, MONDAY_CLOCK_OUT_INSTANT);

  const overtimeApprovedMonday = await submitOvertime(
    employee,
    Role.EMPLOYEE,
    MONDAY,
    '18:00',
    '19:00',
  );
  const overtimeRejectedTuesday = await submitOvertime(
    employee,
    Role.EMPLOYEE,
    TUESDAY,
    '18:00',
    '19:00',
  );
  const overtimePendingMondayOfB = await submitOvertime(
    profileLessEmployee,
    Role.EMPLOYEE,
    MONDAY,
    '18:00',
    '19:00',
  );
  const overtimePendingMondayOfA = await submitOvertime(
    employee,
    Role.EMPLOYEE,
    MONDAY,
    '19:30',
    '20:30',
  );
  const overtimePendingMondayOfHr = await submitOvertime(hr, Role.HR, MONDAY, '20:00', '21:00');
  const overtimePendingWednesdayOfA = await submitOvertime(
    employee,
    Role.EMPLOYEE,
    WEDNESDAY,
    '18:00',
    '19:00',
  );
  const overtimePendingFridayOfB = await submitOvertime(
    profileLessEmployee,
    Role.EMPLOYEE,
    FRIDAY,
    '18:00',
    '19:00',
  );

  const correctionPresentMondayOfA = await submitCorrection(employee, Role.EMPLOYEE, {
    requestedDayStatus: 'PRESENT',
    businessDate: MONDAY,
    clockInAt: `${MONDAY}T09:30:00+07:00`,
    clockOutAt: `${MONDAY}T18:00:00+07:00`,
  });
  const correctionLeaveTuesdayOfB = await submitCorrection(profileLessEmployee, Role.EMPLOYEE, {
    requestedDayStatus: 'LEAVE',
    businessDate: TUESDAY,
  });
  const correctionSickWednesdayOfA = await submitCorrection(employee, Role.EMPLOYEE, {
    requestedDayStatus: 'SICK_LEAVE',
    businessDate: WEDNESDAY,
  });
  const correctionPresentTuesdayOfHr = await submitCorrection(hr, Role.HR, {
    requestedDayStatus: 'PRESENT',
    businessDate: TUESDAY,
    clockInAt: `${TUESDAY}T09:00:00+07:00`,
  });
  const correctionApprovedThursdayOfA = await submitCorrection(employee, Role.EMPLOYEE, {
    requestedDayStatus: 'LEAVE',
    businessDate: '2026-11-05',
  });
  const correctionRejectedFridayOfB = await submitCorrection(profileLessEmployee, Role.EMPLOYEE, {
    requestedDayStatus: 'PRESENT',
    businessDate: FRIDAY,
    clockInAt: `${FRIDAY}T09:00:00+07:00`,
  });

  await decideOvertime(overtimeApprovedMonday, 'APPROVED', null);
  await decideOvertime(overtimeRejectedTuesday, 'REJECTED', 'Not needed this week');
  await decideCorrection(correctionApprovedThursdayOfA, 'APPROVED', null);
  await decideCorrection(correctionRejectedFridayOfB, 'REJECTED', 'Attach the clock record first');

  return {
    overtimeApprovedMonday,
    overtimeRejectedTuesday,
    overtimePendingMondayOfB,
    overtimePendingMondayOfA,
    overtimePendingMondayOfHr,
    overtimePendingWednesdayOfA,
    overtimePendingFridayOfB,
    correctionPresentMondayOfA,
    correctionLeaveTuesdayOfB,
    correctionSickWednesdayOfA,
    correctionPresentTuesdayOfHr,
    correctionApprovedThursdayOfA,
    correctionRejectedFridayOfB,
  };
}

describe('HR review queue', () => {
  let seeded: SeededRequests;

  beforeAll(async () => {
    keys = attendanceServiceAuthKeys();
    container = await new PostgreSqlContainer('postgres:18').start();
    const databaseUrl = await createEmptyDatabaseUri(container.getConnectionUri());
    app = await startApp(databaseUrl);
    employeeProfiles.set(ACCOUNTS.employee, { accountId: ACCOUNTS.employee, ...EMPLOYEE_PROFILE });
    employeeProfiles.set(ACCOUNTS.hr, { accountId: ACCOUNTS.hr, ...HR_PROFILE });
    seeded = await seedRequests();
  }, CONTAINER_TIMEOUT_MS);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  }, CONTAINER_TIMEOUT_MS);

  beforeEach(() => {
    mutableClock.current = REVIEW_MOMENT;
    recordedLookups.length = 0;
  });

  function hrOvertimeQueue(query: Record<string, string> = {}) {
    return getQueue(OVERTIME_PATH, tokenFor(ACCOUNTS.hr, Role.HR), query).expect(200);
  }

  function hrCorrectionQueue(query: Record<string, string> = {}) {
    return getQueue(CORRECTION_PATH, tokenFor(ACCOUNTS.hr, Role.HR), query).expect(200);
  }

  it(
    'should return 403 when an employee token reads either queue',
    async () => {
      await getQueue(OVERTIME_PATH, tokenFor(ACCOUNTS.employee), {}).expect(403);
      await getQueue(CORRECTION_PATH, tokenFor(ACCOUNTS.employee), {}).expect(403);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 when the request has no bearer token',
    async () => {
      await getQueue(OVERTIME_PATH, undefined).expect(401);
      await getQueue(CORRECTION_PATH, undefined).expect(401);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should list every account pending overtime, oldest first, when HR gives no filter',
    async () => {
      const page = overtimeRequestReviewPageSchema.parse((await hrOvertimeQueue()).body);

      expect(page.items.map((item) => item.id)).toEqual([
        seeded.overtimePendingMondayOfB,
        seeded.overtimePendingMondayOfA,
        seeded.overtimePendingMondayOfHr,
        seeded.overtimePendingWednesdayOfA,
        seeded.overtimePendingFridayOfB,
      ]);
      expect(page.totalItems).toBe(5);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should list every account pending correction, oldest first, when HR gives no filter',
    async () => {
      const page = correctionRequestReviewPageSchema.parse((await hrCorrectionQueue()).body);

      expect(page.items.map((item) => item.id)).toEqual([
        seeded.correctionPresentMondayOfA,
        seeded.correctionLeaveTuesdayOfB,
        seeded.correctionSickWednesdayOfA,
        seeded.correctionPresentTuesdayOfHr,
      ]);
      expect(page.totalItems).toBe(4);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should list only the approved requests when the status is APPROVED',
    async () => {
      const overtime = overtimeRequestReviewPageSchema.parse(
        (await hrOvertimeQueue({ status: 'APPROVED' })).body,
      );
      const correction = correctionRequestReviewPageSchema.parse(
        (await hrCorrectionQueue({ status: 'APPROVED' })).body,
      );

      expect(overtime.items.map((item) => item.id)).toEqual([seeded.overtimeApprovedMonday]);
      expect(correction.items.map((item) => item.id)).toEqual([
        seeded.correctionApprovedThursdayOfA,
      ]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should list only the rejected requests with their reviewer reason when the status is REJECTED',
    async () => {
      const overtime = overtimeRequestReviewPageSchema.parse(
        (await hrOvertimeQueue({ status: 'REJECTED' })).body,
      );
      const correction = correctionRequestReviewPageSchema.parse(
        (await hrCorrectionQueue({ status: 'REJECTED' })).body,
      );

      expect(overtime.items).toEqual([
        expect.objectContaining({
          id: seeded.overtimeRejectedTuesday,
          status: 'REJECTED',
          reviewReason: 'Not needed this week',
        }),
      ]);
      expect(correction.items).toEqual([
        expect.objectContaining({
          id: seeded.correctionRejectedFridayOfB,
          status: 'REJECTED',
          reviewReason: 'Attach the clock record first',
        }),
      ]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should list only the requests of the requester when HR gives employeeId',
    async () => {
      const overtime = overtimeRequestReviewPageSchema.parse(
        (await hrOvertimeQueue({ employeeId: ACCOUNTS.employee })).body,
      );
      const correction = correctionRequestReviewPageSchema.parse(
        (await hrCorrectionQueue({ employeeId: ACCOUNTS.employee })).body,
      );

      expect(overtime.items.map((item) => item.id)).toEqual([
        seeded.overtimePendingMondayOfA,
        seeded.overtimePendingWednesdayOfA,
      ]);
      expect(correction.items.map((item) => item.id)).toEqual([
        seeded.correctionPresentMondayOfA,
        seeded.correctionSickWednesdayOfA,
      ]);
      expect(overtime.items.every((item) => item.requester.accountId === ACCOUNTS.employee)).toBe(
        true,
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should list only the requests whose business date is inside the range when HR gives from and to',
    async () => {
      const mondayOvertime = overtimeRequestReviewPageSchema.parse(
        (await hrOvertimeQueue({ from: MONDAY, to: MONDAY })).body,
      );
      const tuesdayCorrection = correctionRequestReviewPageSchema.parse(
        (await hrCorrectionQueue({ from: TUESDAY, to: TUESDAY })).body,
      );

      expect(mondayOvertime.items.map((item) => item.id)).toEqual([
        seeded.overtimePendingMondayOfB,
        seeded.overtimePendingMondayOfA,
        seeded.overtimePendingMondayOfHr,
      ]);
      expect(tuesdayCorrection.items.map((item) => item.id)).toEqual([
        seeded.correctionLeaveTuesdayOfB,
        seeded.correctionPresentTuesdayOfHr,
      ]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should apply only the lower bound when HR gives from alone, and only the upper bound when HR gives to alone',
    async () => {
      const fromFriday = overtimeRequestReviewPageSchema.parse(
        (await hrOvertimeQueue({ from: FRIDAY })).body,
      );
      const toMonday = overtimeRequestReviewPageSchema.parse(
        (await hrOvertimeQueue({ to: MONDAY })).body,
      );

      expect(fromFriday.items.map((item) => item.id)).toEqual([seeded.overtimePendingFridayOfB]);
      expect(toMonday.items.map((item) => item.id)).toEqual([
        seeded.overtimePendingMondayOfB,
        seeded.overtimePendingMondayOfA,
        seeded.overtimePendingMondayOfHr,
      ]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should split the queue into pages, oldest first, and report the total',
    async () => {
      const first = overtimeRequestReviewPageSchema.parse(
        (await hrOvertimeQueue({ pageSize: '2', page: '1' })).body,
      );
      const second = overtimeRequestReviewPageSchema.parse(
        (await hrOvertimeQueue({ pageSize: '2', page: '2' })).body,
      );
      const last = overtimeRequestReviewPageSchema.parse(
        (await hrOvertimeQueue({ pageSize: '2', page: '3' })).body,
      );

      expect(first).toMatchObject({ page: 1, pageSize: 2, totalItems: 5, totalPages: 3 });
      expect(first.items.map((item) => item.id)).toEqual([
        seeded.overtimePendingMondayOfB,
        seeded.overtimePendingMondayOfA,
      ]);
      expect(second.items.map((item) => item.id)).toEqual([
        seeded.overtimePendingMondayOfHr,
        seeded.overtimePendingWednesdayOfA,
      ]);
      expect(last.items.map((item) => item.id)).toEqual([seeded.overtimePendingFridayOfB]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should answer an empty page with a zero total when the page is beyond the last one',
    async () => {
      const page = correctionRequestReviewPageSchema.parse(
        (await hrCorrectionQueue({ page: '5', pageSize: '2' })).body,
      );

      expect(page).toMatchObject({ items: [], page: 5, totalItems: 4, totalPages: 2 });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should answer isOwnRequest true only for the request that HR made',
    async () => {
      const overtime = overtimeRequestReviewPageSchema.parse((await hrOvertimeQueue()).body);
      const correction = correctionRequestReviewPageSchema.parse((await hrCorrectionQueue()).body);

      expect(
        overtime.items.map((item) => ({ id: item.id, isOwnRequest: item.isOwnRequest })),
      ).toEqual([
        { id: seeded.overtimePendingMondayOfB, isOwnRequest: false },
        { id: seeded.overtimePendingMondayOfA, isOwnRequest: false },
        { id: seeded.overtimePendingMondayOfHr, isOwnRequest: true },
        { id: seeded.overtimePendingWednesdayOfA, isOwnRequest: false },
        { id: seeded.overtimePendingFridayOfB, isOwnRequest: false },
      ]);
      expect(
        correction.items.map((item) => ({ id: item.id, isOwnRequest: item.isOwnRequest })),
      ).toEqual([
        { id: seeded.correctionPresentMondayOfA, isOwnRequest: false },
        { id: seeded.correctionLeaveTuesdayOfB, isOwnRequest: false },
        { id: seeded.correctionSickWednesdayOfA, isOwnRequest: false },
        { id: seeded.correctionPresentTuesdayOfHr, isOwnRequest: true },
      ]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should show the requester name for a known account and null for an unknown one',
    async () => {
      const overtime = overtimeRequestReviewPageSchema.parse((await hrOvertimeQueue()).body);

      const itemOfEmployee = overtime.items.find(
        (item) => item.id === seeded.overtimePendingMondayOfA,
      );
      const itemOfUnknown = overtime.items.find(
        (item) => item.id === seeded.overtimePendingMondayOfB,
      );
      expect(itemOfEmployee?.requester).toEqual({
        accountId: ACCOUNTS.employee,
        name: EMPLOYEE_PROFILE.name,
      });
      expect(itemOfUnknown?.requester).toEqual({
        accountId: ACCOUNTS.profileLessEmployee,
        name: null,
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should show the effective times and day status of a punched day with the requested times apart',
    async () => {
      const correction = correctionRequestReviewPageSchema.parse((await hrCorrectionQueue()).body);

      const punchedDay = correction.items.find(
        (item) => item.id === seeded.correctionPresentMondayOfA,
      );
      expect(punchedDay).toMatchObject({
        businessDate: MONDAY,
        requestedDayStatus: 'PRESENT',
        clockInAt: `${MONDAY}T02:30:00.000Z`,
        clockOutAt: `${MONDAY}T11:00:00.000Z`,
        current: {
          clockInAt: MONDAY_CLOCK_IN_INSTANT.toISOString(),
          clockOutAt: MONDAY_CLOCK_OUT_INSTANT.toISOString(),
          dayStatus: 'PRESENT',
        },
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should show no current times and the pending day status for a day with no punch',
    async () => {
      const correction = correctionRequestReviewPageSchema.parse((await hrCorrectionQueue()).body);

      const noPunchDay = correction.items.find(
        (item) => item.id === seeded.correctionLeaveTuesdayOfB,
      );
      expect(noPunchDay?.current).toEqual({
        clockInAt: null,
        clockOutAt: null,
        dayStatus: 'PENDING',
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should show the approved overtime minutes of the requester on the same business date',
    async () => {
      const overtime = overtimeRequestReviewPageSchema.parse((await hrOvertimeQueue()).body);
      const second = overtimeRequestReviewPageSchema.parse(
        (await hrOvertimeQueue({ status: 'APPROVED' })).body,
      );

      const pendingMondayOfA = overtime.items.find(
        (item) => item.id === seeded.overtimePendingMondayOfA,
      );
      const pendingMondayOfB = overtime.items.find(
        (item) => item.id === seeded.overtimePendingMondayOfB,
      );
      const pendingWednesdayOfA = overtime.items.find(
        (item) => item.id === seeded.overtimePendingWednesdayOfA,
      );
      expect(pendingMondayOfA?.current).toEqual({ approvedMinutes: 60 });
      expect(pendingMondayOfB?.current).toEqual({ approvedMinutes: 0 });
      expect(pendingWednesdayOfA?.current).toEqual({ approvedMinutes: 0 });
      expect(second.items[0]?.current).toEqual({ approvedMinutes: 60 });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should resolve the names of a page with one batched lookup of its distinct requesters',
    async () => {
      await hrOvertimeQueue().expect(200);
      await hrCorrectionQueue().expect(200);

      expect(recordedLookups).toHaveLength(2);
      expect([...(recordedLookups[0] ?? [])].sort()).toEqual(
        [ACCOUNTS.employee, ACCOUNTS.profileLessEmployee, ACCOUNTS.hr].sort(),
      );
      expect([...(recordedLookups[1] ?? [])].sort()).toEqual(
        [ACCOUNTS.employee, ACCOUNTS.profileLessEmployee, ACCOUNTS.hr].sort(),
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should look up one account when the page has the requests of one requester',
    async () => {
      await hrOvertimeQueue({ employeeId: ACCOUNTS.employee }).expect(200);

      expect(recordedLookups).toEqual([[ACCOUNTS.employee]]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should make no lookup when the page is empty',
    async () => {
      const overtime = overtimeRequestReviewPageSchema.parse(
        (await hrOvertimeQueue({ from: FAR_FUTURE_DATE, to: FAR_FUTURE_DATE })).body,
      );
      const correction = correctionRequestReviewPageSchema.parse(
        (await hrCorrectionQueue({ from: FAR_FUTURE_DATE, to: FAR_FUTURE_DATE })).body,
      );

      expect(overtime).toMatchObject({ items: [], totalItems: 0, totalPages: 0 });
      expect(correction).toMatchObject({ items: [], totalItems: 0, totalPages: 0 });
      expect(recordedLookups).toHaveLength(0);
    },
    TEST_TIMEOUT_MS,
  );

  it.each<{ readonly condition: string; readonly query: Record<string, string> }>([
    { condition: 'from is after to', query: { from: FRIDAY, to: MONDAY } },
    { condition: 'the status is not a request status', query: { status: 'CANCELLED' } },
    { condition: 'employeeId is not an account ID', query: { employeeId: 'nadia' } },
    { condition: 'the requester is named by accountId', query: { accountId: ACCOUNTS.employee } },
    { condition: 'the page size is above the maximum', query: { pageSize: '101' } },
  ])(
    'should return 400 VALIDATION_FAILED when $condition on both queues',
    async ({ query }) => {
      const overtime = await getQueue(OVERTIME_PATH, tokenFor(ACCOUNTS.hr, Role.HR), query).expect(
        400,
      );
      const correction = await getQueue(
        CORRECTION_PATH,
        tokenFor(ACCOUNTS.hr, Role.HR),
        query,
      ).expect(400);

      expect(overtime.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
      expect(correction.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
    },
    TEST_TIMEOUT_MS,
  );
});
