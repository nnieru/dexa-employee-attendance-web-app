import { randomUUID } from 'node:crypto';
import { CLOCK, configureApp, parseConfig, ServiceName, type IClock } from '@dexa/common';
import { ErrorCode, Role } from '@dexa/contracts';
import type { Database } from '@dexa/db';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { alias } from 'drizzle-orm/pg-core';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { createAppModule } from '../src/app.module.js';
import { AttendanceServiceConfigSchema } from '../src/config/attendance-service-config.schema.js';
import {
  EMPLOYEE_CLIENT,
  type IEmployeeClient,
} from '../src/employees/employee-client.interface.js';
import { DATABASE } from '../src/infrastructure/db/database.token.js';
import {
  attendanceDays,
  attendanceEntries,
  masterAttendanceStatuses,
} from '../src/infrastructure/db/schema.js';
import type { AuthKeySet } from './auth-key-set.js';
import {
  attendanceServiceAuthKeys,
  attendanceServiceEnvironment,
} from './attendance-service-environment.js';
import { signGatewayUserToken } from './gateway-user-token.js';
import {
  CONTAINER_TIMEOUT_MS,
  TEST_TIMEOUT_MS,
  createEmptyDatabaseUri,
  requireRow,
} from './test-database.js';

const SUBMIT_PATH = '/api/v1/attendance-corrections';
const CLOCK_IN_PATH = '/api/v1/attendance/clock-in';
const CLOCK_OUT_PATH = '/api/v1/attendance/clock-out';
const TOKEN_LIFETIME_SECONDS = 60;
// The default schedule takes effect on the business date the clock reads at startup (WIB Monday 2026-11-02).
// The schedule is 09:00 to 18:00 WIB on Monday to Friday.
const FIRST_START_INSTANT = new Date('2026-11-02T01:00:00Z');
const TUESDAY = '2026-11-03';
const SATURDAY = '2026-11-07';
// Tuesday 09:30 WIB (raw clock-in) and Tuesday 18:00 WIB (scheduled end, a valid check-out instant).
const TUESDAY_CLOCK_IN_INSTANT = new Date('2026-11-03T02:30:00Z');
const TUESDAY_CLOCK_OUT_INSTANT = new Date('2026-11-03T11:00:00Z');
// Saturday 09:20 WIB, a punch on a day off.
const SATURDAY_CLOCK_IN_INSTANT = new Date('2026-11-07T02:20:00Z');
// Wednesday 10:00 WIB: after every Tuesday punch, and inside the 30-day window for Tuesday and Saturday.
const SUBMIT_MOMENT = new Date('2026-11-04T03:00:00Z');
const SATURDAY_SUBMIT_MOMENT = new Date('2026-11-07T12:00:00Z');
// The decision must be after the real insert time of the request, so it is set in the future of the suite start.
const ONE_HOUR_MS = 60 * 60 * 1000;
const DECISION_MOMENT = new Date(Date.now() + ONE_HOUR_MS);

const mutableClock: { current: Date } = { current: FIRST_START_INSTANT };
const fixedClock: IClock = { now: () => new Date(mutableClock.current) };

// Stands in for employee-service. The request responses do not need names, so no account is looked up.
const emptyEmployeeClient: IEmployeeClient = {
  lookupEmployees: () => Promise.resolve([]),
};

let container: StartedPostgreSqlContainer;
let app: INestApplication;
let database: Database;
let keys: AuthKeySet;

function tokenFor(accountId: string, role: Role = Role.EMPLOYEE): string {
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECONDS;
  return signGatewayUserToken(keys, ServiceName.ATTENDANCE_SERVICE, accountId, role, expiresAt);
}

// Every submission gets a fresh key, so a test never replays another test's request.
function leaveBody(
  requestedDayStatus: 'SICK_LEAVE' | 'LEAVE',
  businessDate = TUESDAY,
): Record<string, unknown> {
  return {
    requestedDayStatus,
    businessDate,
    reason: 'Doctor note on file',
    idempotencyKey: randomUUID(),
  };
}

// Submits as the employee at the given instant and returns the new request's ID.
async function submitCorrection(
  employeeId: string,
  body: Record<string, unknown>,
  at: Date = SUBMIT_MOMENT,
): Promise<string> {
  mutableClock.current = at;
  const response = await request(app.getHttpServer())
    .post(SUBMIT_PATH)
    .set('Authorization', `Bearer ${tokenFor(employeeId)}`)
    .send(body)
    .expect(201);
  return response.body.id;
}

// The HR reviewer is a different account from the employee, so the self-review rule never applies here.
function decide(
  requestId: string,
  action: 'approve' | 'reject',
  body: Record<string, unknown>,
): request.Test {
  mutableClock.current = DECISION_MOMENT;
  return request(app.getHttpServer())
    .post(`${SUBMIT_PATH}/${requestId}/${action}`)
    .set('Authorization', `Bearer ${tokenFor(randomUUID(), Role.HR)}`)
    .send(body);
}

async function approveLeave(employeeId: string, body: Record<string, unknown>): Promise<void> {
  const requestId = await submitCorrection(employeeId, body);
  await decide(requestId, 'approve', {}).expect(200);
}

function punchAt(path: string, accountId: string, at: Date) {
  mutableClock.current = at;
  return request(app.getHttpServer())
    .post(path)
    .set('Authorization', `Bearer ${tokenFor(accountId)}`)
    .send({});
}

// The day with its status codes resolved, so an assertion reads the stored code and not an ID.
async function readDay(accountId: string, businessDate: string) {
  const dayStatus = alias(masterAttendanceStatuses, 'day_status');
  const checkinStatus = alias(masterAttendanceStatuses, 'checkin_status');
  const checkoutStatus = alias(masterAttendanceStatuses, 'checkout_status');
  const [row] = await database.db
    .select({
      id: attendanceDays.id,
      revision: attendanceDays.revision,
      effectiveCheckinAt: attendanceDays.effectiveCheckinAt,
      effectiveCheckoutAt: attendanceDays.effectiveCheckoutAt,
      dayStatus: dayStatus.code,
      checkinStatus: checkinStatus.code,
      checkoutStatus: checkoutStatus.code,
    })
    .from(attendanceDays)
    .innerJoin(dayStatus, eq(dayStatus.id, attendanceDays.dayStatusId))
    .innerJoin(checkinStatus, eq(checkinStatus.id, attendanceDays.checkinStatusId))
    .innerJoin(checkoutStatus, eq(checkoutStatus.id, attendanceDays.checkoutStatusId))
    .where(
      and(eq(attendanceDays.accountId, accountId), eq(attendanceDays.businessDate, businessDate)),
    );
  return requireRow(row);
}

async function readEntries(attendanceDayId: string) {
  return database.db
    .select({ type: attendanceEntries.type, recordedAt: attendanceEntries.recordedAt })
    .from(attendanceEntries)
    .where(eq(attendanceEntries.attendanceDayId, attendanceDayId));
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
    .useValue(emptyEmployeeClient)
    .compile();
  const nestApp = moduleRef.createNestApplication();
  configureApp(nestApp, { CORS_ORIGINS: [] });
  await nestApp.init();
  database = moduleRef.get<Database>(DATABASE);
  return nestApp;
}

describe('punches on an approved leave day', () => {
  beforeAll(async () => {
    keys = attendanceServiceAuthKeys();
    container = await new PostgreSqlContainer('postgres:18').start();
    const databaseUrl = await createEmptyDatabaseUri(container.getConnectionUri());
    app = await startApp(databaseUrl);
  }, CONTAINER_TIMEOUT_MS);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  }, CONTAINER_TIMEOUT_MS);

  describe('clock in', () => {
    it.each([
      { condition: 'Sick leave', leaveStatus: 'SICK_LEAVE' as const },
      { condition: 'Leave', leaveStatus: 'LEAVE' as const },
    ])(
      'should return 409 ATTENDANCE_DAY_ON_LEAVE, twice, and record nothing when the employee clocks in on an approved $condition day',
      async ({ leaveStatus }) => {
        const employee = randomUUID();
        await approveLeave(employee, leaveBody(leaveStatus));
        const dayBefore = await readDay(employee, TUESDAY);

        const first = await punchAt(CLOCK_IN_PATH, employee, TUESDAY_CLOCK_IN_INSTANT).expect(409);
        const retry = await punchAt(CLOCK_IN_PATH, employee, TUESDAY_CLOCK_IN_INSTANT).expect(409);

        expect(first.body).toMatchObject({
          statusCode: 409,
          code: ErrorCode.ATTENDANCE_DAY_ON_LEAVE,
        });
        expect(retry.body).toMatchObject({
          statusCode: 409,
          code: ErrorCode.ATTENDANCE_DAY_ON_LEAVE,
        });
        expect(await readDay(employee, TUESDAY)).toEqual(dayBefore);
        expect(await readEntries(dayBefore.id)).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should record the punch on a day that a pending leave request created, because only an approved leave blocks it',
      async () => {
        const employee = randomUUID();
        await submitCorrection(employee, leaveBody('SICK_LEAVE'));

        const response = await punchAt(CLOCK_IN_PATH, employee, TUESDAY_CLOCK_IN_INSTANT).expect(
          201,
        );

        expect(response.body).toMatchObject({
          type: 'IN',
          businessDate: TUESDAY,
          classification: 'LATE_CHECKIN',
        });
        const day = await readDay(employee, TUESDAY);
        expect(day.effectiveCheckinAt?.toISOString()).toBe('2026-11-03T02:30:00.000Z');
        expect(await readEntries(day.id)).toHaveLength(1);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should record the punch on a day off that a request created, because a day off is not a leave day',
      async () => {
        const employee = randomUUID();
        await submitCorrection(employee, leaveBody('SICK_LEAVE', SATURDAY), SATURDAY_SUBMIT_MOMENT);

        const response = await punchAt(CLOCK_IN_PATH, employee, SATURDAY_CLOCK_IN_INSTANT).expect(
          201,
        );

        expect(response.body).toMatchObject({
          businessDate: SATURDAY,
          classification: 'CHECKIN_NOT_REQUIRED',
        });
        expect(await readEntries((await readDay(employee, SATURDAY)).id)).toHaveLength(1);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should keep the punch of another employee working when a different employee is on approved leave that day',
      async () => {
        const onLeave = randomUUID();
        const working = randomUUID();
        await approveLeave(onLeave, leaveBody('LEAVE'));

        await punchAt(CLOCK_IN_PATH, onLeave, TUESDAY_CLOCK_IN_INSTANT).expect(409);
        const response = await punchAt(CLOCK_IN_PATH, working, TUESDAY_CLOCK_IN_INSTANT).expect(
          201,
        );

        expect(response.body).toMatchObject({ businessDate: TUESDAY, type: 'IN' });
        expect(await readEntries((await readDay(working, TUESDAY)).id)).toHaveLength(1);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should record the punch when the leave request was rejected, because a rejected request changes nothing',
      async () => {
        const employee = randomUUID();
        const requestId = await submitCorrection(employee, leaveBody('SICK_LEAVE'));
        await decide(requestId, 'reject', { reviewReason: 'Not supported by the note' }).expect(
          200,
        );

        const response = await punchAt(CLOCK_IN_PATH, employee, TUESDAY_CLOCK_IN_INSTANT).expect(
          201,
        );

        expect(response.body).toMatchObject({ type: 'IN', businessDate: TUESDAY });
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('clock out', () => {
    it(
      'should return 409 ATTENDANCE_DAY_ON_LEAVE, not ATTENDANCE_NOT_CLOCKED_IN, and record nothing when an approved leave day has no punch',
      async () => {
        const employee = randomUUID();
        await approveLeave(employee, leaveBody('LEAVE'));
        const dayBefore = await readDay(employee, TUESDAY);

        const response = await punchAt(CLOCK_OUT_PATH, employee, TUESDAY_CLOCK_OUT_INSTANT).expect(
          409,
        );

        expect(response.body).toMatchObject({
          statusCode: 409,
          code: ErrorCode.ATTENDANCE_DAY_ON_LEAVE,
        });
        expect(await readDay(employee, TUESDAY)).toEqual(dayBefore);
        expect(await readEntries(dayBefore.id)).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 409 ATTENDANCE_DAY_ON_LEAVE and keep the raw clock-in unchanged when the employee clocked in before the leave was approved',
      async () => {
        const employee = randomUUID();
        await punchAt(CLOCK_IN_PATH, employee, TUESDAY_CLOCK_IN_INSTANT).expect(201);
        // The request is submitted after the punch, so its base revision is the revision after the clock-in.
        await approveLeave(employee, leaveBody('LEAVE'));
        const dayBefore = await readDay(employee, TUESDAY);
        const entriesBefore = await readEntries(dayBefore.id);

        const response = await punchAt(CLOCK_OUT_PATH, employee, TUESDAY_CLOCK_OUT_INSTANT).expect(
          409,
        );

        expect(response.body).toMatchObject({
          statusCode: 409,
          code: ErrorCode.ATTENDANCE_DAY_ON_LEAVE,
        });
        expect(dayBefore).toMatchObject({
          dayStatus: 'LEAVE',
          effectiveCheckinAt: null,
          effectiveCheckoutAt: null,
        });
        expect(await readDay(employee, TUESDAY)).toEqual(dayBefore);
        expect(await readEntries(dayBefore.id)).toEqual(entriesBefore);
        expect(entriesBefore).toEqual([
          expect.objectContaining({
            type: 'IN',
            recordedAt: TUESDAY_CLOCK_IN_INSTANT,
          }),
        ]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 409 ATTENDANCE_DAY_ON_LEAVE, not ATTENDANCE_ALREADY_CLOCKED_IN, when the employee clocks in again on that approved leave day',
      async () => {
        const employee = randomUUID();
        await punchAt(CLOCK_IN_PATH, employee, TUESDAY_CLOCK_IN_INSTANT).expect(201);
        await approveLeave(employee, leaveBody('SICK_LEAVE'));
        const dayBefore = await readDay(employee, TUESDAY);

        const response = await punchAt(CLOCK_IN_PATH, employee, TUESDAY_CLOCK_IN_INSTANT).expect(
          409,
        );

        expect(response.body).toMatchObject({
          statusCode: 409,
          code: ErrorCode.ATTENDANCE_DAY_ON_LEAVE,
        });
        expect(await readDay(employee, TUESDAY)).toEqual(dayBefore);
        expect(await readEntries(dayBefore.id)).toHaveLength(1);
      },
      TEST_TIMEOUT_MS,
    );
  });
});
