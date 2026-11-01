import { randomUUID } from 'node:crypto';
import { CLOCK, configureApp, parseConfig, ServiceName, type IClock } from '@dexa/common';
import { ErrorCode, Role, type CorrectionRequest } from '@dexa/contracts';
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
  attendanceAdjustmentRequests,
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
const SUMMARY_PATH = '/api/v1/attendance/me';
const TOKEN_LIFETIME_SECONDS = 60;
// The default schedule takes effect on the business date the clock reads at startup, so the clock starts on Monday
// 2026-11-02 (WIB). The default schedule is 09:00 to 18:00 WIB on Monday to Friday.
const FIRST_START_INSTANT = new Date('2026-11-02T01:00:00Z');
const MONDAY = '2026-11-02';
const TUESDAY = '2026-11-03';
const WEDNESDAY = '2026-11-04';
const SATURDAY = '2026-11-07';
// Wednesday 10:00 WIB: after every Tuesday time the tests request, and inside the 30-day window for Tuesday.
const SUBMIT_MOMENT = new Date('2026-11-04T03:00:00Z');
const SATURDAY_SUBMIT_MOMENT = new Date('2026-11-07T12:00:00Z');
// The database requires reviewed_at >= created_at, and created_at is the real insert time. The decision moment is
// therefore set after the suite starts, so the check holds whatever the wall clock reads when the suite runs.
const ONE_HOUR_MS = 60 * 60 * 1000;
const DECISION_MOMENT = new Date(Date.now() + ONE_HOUR_MS);
const LATER_DECISION_MOMENT = new Date(Date.now() + 2 * ONE_HOUR_MS);
// The race tests use a far-future business date. Their decision and punch share the fixed clock, so the instant must
// stay after the real insert time for as long as the suite runs. Tuesday 2031-03-04: 19:00 WIB submit, 09:00 WIB punch.
const RACE_BUSINESS_DATE = '2031-03-04';
const RACE_SUBMIT_MOMENT = new Date('2031-03-04T12:00:00Z');
const RACE_MOMENT = new Date('2031-03-04T02:00:00Z');
const mutableClock: { current: Date } = { current: FIRST_START_INSTANT };
const fixedClock: IClock = { now: () => new Date(mutableClock.current) };

// Stands in for employee-service. The decision responses do not need names, so no account is looked up.
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
function presentBody(overrides: Record<string, unknown> = {}) {
  return {
    requestedDayStatus: 'PRESENT',
    businessDate: TUESDAY,
    clockInAt: '2026-11-03T09:20:00+07:00',
    clockOutAt: '2026-11-03T17:00:00+07:00',
    reason: 'Forgot to clock in',
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

function leaveBody(
  requestedDayStatus: 'SICK_LEAVE' | 'LEAVE',
  overrides: Record<string, unknown> = {},
) {
  return {
    requestedDayStatus,
    businessDate: TUESDAY,
    reason: 'Doctor note on file',
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

// Submits as the given account and returns the new request's ID. The clock is set to the submission instant first.
async function submitCorrection(
  accountId: string,
  body: Record<string, unknown>,
  options: { readonly role?: Role; readonly at?: Date } = {},
): Promise<string> {
  mutableClock.current = options.at ?? SUBMIT_MOMENT;
  const response = await request(app.getHttpServer())
    .post(SUBMIT_PATH)
    .set('Authorization', `Bearer ${tokenFor(accountId, options.role)}`)
    .send(body)
    .expect(201);
  return response.body.id;
}

function punchIn(accountId: string, at: Date) {
  mutableClock.current = at;
  return request(app.getHttpServer())
    .post(CLOCK_IN_PATH)
    .set('Authorization', `Bearer ${tokenFor(accountId)}`)
    .send({});
}

// Each test uses its own requester, so one test's day never affects another's.
function decide(
  requestId: string,
  action: 'approve' | 'reject',
  accountId: string,
  body: Record<string, unknown> | undefined,
  role: Role = Role.HR,
  at: Date = DECISION_MOMENT,
) {
  mutableClock.current = at;
  const pending = request(app.getHttpServer())
    .post(`${SUBMIT_PATH}/${requestId}/${action}`)
    .set('Authorization', `Bearer ${tokenFor(accountId, role)}`);
  return body === undefined ? pending : pending.send(body);
}

async function readStoredRequest(requestId: string) {
  const [row] = await database.db
    .select()
    .from(attendanceAdjustmentRequests)
    .where(eq(attendanceAdjustmentRequests.id, requestId));
  return row;
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

async function readSummaryItems(accountId: string) {
  const response = await request(app.getHttpServer())
    .get(SUMMARY_PATH)
    .query({ from: MONDAY, to: WEDNESDAY })
    .set('Authorization', `Bearer ${tokenFor(accountId)}`)
    .expect(200);
  return response.body.items;
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

describe('correction request decisions', () => {
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

  describe('approve', () => {
    it(
      'should apply a present correction to a day with no punch, reclassify it, and keep the raw punches unchanged',
      async () => {
        const employee = randomUUID();
        const reviewer = randomUUID();
        const requestId = await submitCorrection(employee, presentBody());

        const response = await decide(requestId, 'approve', reviewer, {}).expect(200);

        expect(response.body).toMatchObject({
          id: requestId,
          status: 'APPROVED',
          reviewReason: null,
          reviewedAt: DECISION_MOMENT.toISOString(),
          clockInAt: '2026-11-03T02:20:00.000Z',
          clockOutAt: '2026-11-03T10:00:00.000Z',
        });
        expect(await readStoredRequest(requestId)).toMatchObject({
          status: 'APPROVED',
          reviewedByAccountId: reviewer,
          baseRevision: 1,
          appliedRevision: 2,
        });
        const day = await readDay(employee, TUESDAY);
        expect(day).toMatchObject({
          revision: 2,
          dayStatus: 'PRESENT',
          checkinStatus: 'LATE_CHECKIN',
          checkoutStatus: 'EARLY_CHECKOUT',
        });
        expect(day.effectiveCheckinAt?.toISOString()).toBe('2026-11-03T02:20:00.000Z');
        expect(day.effectiveCheckoutAt?.toISOString()).toBe('2026-11-03T10:00:00.000Z');
        expect(await readEntries(day.id)).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should show the corrected times and recalculated classification in the employee summary',
      async () => {
        const employee = randomUUID();
        const requestId = await submitCorrection(employee, presentBody());
        await decide(requestId, 'approve', randomUUID(), {}).expect(200);

        const items = await readSummaryItems(employee);

        expect(items).toEqual([
          {
            businessDate: TUESDAY,
            clockInAt: '2026-11-03T02:20:00.000Z',
            clockInStatus: 'LATE_CHECKIN',
            clockOutAt: '2026-11-03T10:00:00.000Z',
            clockOutStatus: 'EARLY_CHECKOUT',
          },
        ]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should replace the effective times of a punched day and keep the original punches',
      async () => {
        const employee = randomUUID();
        await punchIn(employee, new Date('2026-11-03T02:00:00Z')).expect(201);
        const requestId = await submitCorrection(
          employee,
          presentBody({
            clockInAt: '2026-11-03T08:30:00+07:00',
            clockOutAt: '2026-11-03T18:30:00+07:00',
          }),
        );
        const before = await readDay(employee, TUESDAY);

        await decide(requestId, 'approve', randomUUID(), {}).expect(200);

        const after = await readDay(employee, TUESDAY);
        expect(before.revision).toBe(2);
        expect(after).toMatchObject({
          revision: 3,
          dayStatus: 'PRESENT',
          checkinStatus: 'EARLY_CHECKIN',
          checkoutStatus: 'LATE_CHECKOUT',
        });
        expect(after.effectiveCheckinAt?.toISOString()).toBe('2026-11-03T01:30:00.000Z');
        expect(after.effectiveCheckoutAt?.toISOString()).toBe('2026-11-03T11:30:00.000Z');
        expect(await readEntries(after.id)).toEqual([
          { type: 'IN', recordedAt: new Date('2026-11-03T02:00:00Z') },
        ]);
        expect(await readStoredRequest(requestId)).toMatchObject({ appliedRevision: 3 });
      },
      TEST_TIMEOUT_MS,
    );

    it.each([
      { requestedDayStatus: 'SICK_LEAVE' as const },
      { requestedDayStatus: 'LEAVE' as const },
    ])(
      'should set $requestedDayStatus with no effective times and not-required timing statuses',
      async ({ requestedDayStatus }) => {
        const employee = randomUUID();
        const requestId = await submitCorrection(employee, leaveBody(requestedDayStatus));

        await decide(requestId, 'approve', randomUUID(), {}).expect(200);

        const day = await readDay(employee, TUESDAY);
        expect(day).toMatchObject({
          revision: 2,
          dayStatus: requestedDayStatus,
          checkinStatus: 'CHECKIN_NOT_REQUIRED',
          checkoutStatus: 'CHECKOUT_NOT_REQUIRED',
          effectiveCheckinAt: null,
          effectiveCheckoutAt: null,
        });
        expect(await readStoredRequest(requestId)).toMatchObject({ appliedRevision: 2 });
        expect(await readSummaryItems(employee)).toEqual([
          {
            businessDate: TUESDAY,
            clockInAt: null,
            clockInStatus: 'CHECKIN_NOT_REQUIRED',
            clockOutAt: null,
            clockOutStatus: 'CHECKOUT_NOT_REQUIRED',
          },
        ]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should classify a present correction on a day off as not required',
      async () => {
        const employee = randomUUID();
        const requestId = await submitCorrection(
          employee,
          presentBody({
            businessDate: SATURDAY,
            clockInAt: '2026-11-07T09:00:00+07:00',
            clockOutAt: '2026-11-07T17:00:00+07:00',
          }),
          { at: SATURDAY_SUBMIT_MOMENT },
        );

        await decide(requestId, 'approve', randomUUID(), {}).expect(200);

        expect(await readDay(employee, SATURDAY)).toMatchObject({
          revision: 2,
          dayStatus: 'PRESENT',
          checkinStatus: 'CHECKIN_NOT_REQUIRED',
          checkoutStatus: 'CHECKOUT_NOT_REQUIRED',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should refuse an approval when the day changed after submission, and write nothing',
      async () => {
        const employee = randomUUID();
        const requestId = await submitCorrection(employee, presentBody());
        await punchIn(employee, new Date('2026-11-03T02:00:00Z')).expect(201);
        const dayBefore = await readDay(employee, TUESDAY);

        const response = await decide(requestId, 'approve', randomUUID(), {}).expect(409);

        expect(response.body).toMatchObject({
          statusCode: 409,
          code: ErrorCode.ATTENDANCE_DAY_CHANGED,
        });
        expect(await readStoredRequest(requestId)).toMatchObject({
          status: 'PENDING',
          reviewedByAccountId: null,
          reviewedAt: null,
          appliedRevision: null,
        });
        expect(await readDay(employee, TUESDAY)).toEqual(dayBefore);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should allow HR to reject a stale request, and leave the day as it stands',
      async () => {
        const employee = randomUUID();
        const requestId = await submitCorrection(employee, presentBody());
        await punchIn(employee, new Date('2026-11-03T02:00:00Z')).expect(201);
        const dayBefore = await readDay(employee, TUESDAY);

        const response = await decide(requestId, 'reject', randomUUID(), {
          reviewReason: 'Use the punch on record',
        }).expect(200);

        expect(response.body).toMatchObject({
          status: 'REJECTED',
          reviewReason: 'Use the punch on record',
        });
        expect(await readDay(employee, TUESDAY)).toEqual(dayBefore);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('reject', () => {
    it(
      'should reject a pending request with the reason and the decision instant, and leave the day unchanged',
      async () => {
        const employee = randomUUID();
        const reviewer = randomUUID();
        const requestId = await submitCorrection(employee, presentBody());
        const dayBefore = await readDay(employee, TUESDAY);

        const response = await decide(requestId, 'reject', reviewer, {
          reviewReason: '  Clock records differ  ',
        }).expect(200);

        expect(response.body).toMatchObject({
          status: 'REJECTED',
          reviewReason: 'Clock records differ',
          reviewedAt: DECISION_MOMENT.toISOString(),
        });
        expect(await readStoredRequest(requestId)).toMatchObject({
          status: 'REJECTED',
          reviewedByAccountId: reviewer,
          appliedRevision: null,
        });
        expect(await readDay(employee, TUESDAY)).toEqual(dayBefore);
      },
      TEST_TIMEOUT_MS,
    );

    it.each([
      { condition: 'the body has no reason', body: {} },
      { condition: 'the reason is whitespace only', body: { reviewReason: '   ' } },
    ])(
      'should refuse a rejection when $condition and leave the request pending',
      async ({ body }) => {
        const requestId = await submitCorrection(randomUUID(), presentBody());

        const response = await decide(requestId, 'reject', randomUUID(), body).expect(400);

        expect(response.body).toMatchObject({ statusCode: 400 });
        expect(await readStoredRequest(requestId)).toMatchObject({
          status: 'PENDING',
          reviewedByAccountId: null,
        });
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('decision rules', () => {
    it(
      'should refuse HR deciding their own request with 403 and write nothing',
      async () => {
        const hrAccountId = randomUUID();
        const requestId = await submitCorrection(hrAccountId, presentBody(), { role: Role.HR });
        const dayBefore = await readDay(hrAccountId, TUESDAY);

        const approved = await decide(requestId, 'approve', hrAccountId, {}).expect(403);
        const rejected = await decide(requestId, 'reject', hrAccountId, {
          reviewReason: 'Mine',
        }).expect(403);

        expect(approved.body).toMatchObject({
          statusCode: 403,
          code: ErrorCode.SELF_REVIEW_FORBIDDEN,
        });
        expect(rejected.body).toMatchObject({ code: ErrorCode.SELF_REVIEW_FORBIDDEN });
        expect(await readStoredRequest(requestId)).toMatchObject({
          status: 'PENDING',
          reviewedByAccountId: null,
        });
        expect(await readDay(hrAccountId, TUESDAY)).toEqual(dayBefore);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 403 and write nothing when an employee token decides a request',
      async () => {
        const requestId = await submitCorrection(randomUUID(), presentBody());
        const employee = randomUUID();

        await decide(requestId, 'approve', employee, {}, Role.EMPLOYEE).expect(403);
        await decide(requestId, 'reject', employee, { reviewReason: 'Nope' }, Role.EMPLOYEE).expect(
          403,
        );

        expect(await readStoredRequest(requestId)).toMatchObject({ status: 'PENDING' });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 401 when the decision has no bearer token',
      async () => {
        const requestId = await submitCorrection(randomUUID(), presentBody());

        await request(app.getHttpServer())
          .post(`${SUBMIT_PATH}/${requestId}/approve`)
          .send({})
          .expect(401);

        expect(await readStoredRequest(requestId)).toMatchObject({ status: 'PENDING' });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should answer the recorded result and write nothing when the same approval is repeated',
      async () => {
        const employee = randomUUID();
        const firstReviewer = randomUUID();
        const requestId = await submitCorrection(employee, presentBody());
        const first = await decide(requestId, 'approve', firstReviewer, {}).expect(200);

        const replay = await decide(
          requestId,
          'approve',
          randomUUID(),
          {},
          Role.HR,
          LATER_DECISION_MOMENT,
        ).expect(200);

        expect(replay.body).toEqual(first.body);
        expect(await readStoredRequest(requestId)).toMatchObject({
          reviewedByAccountId: firstReviewer,
          appliedRevision: 2,
        });
        expect(await readDay(employee, TUESDAY)).toMatchObject({ revision: 2 });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should refuse a rejection of an approved request with 409 and keep the approval',
      async () => {
        const employee = randomUUID();
        const requestId = await submitCorrection(employee, presentBody());
        await decide(requestId, 'approve', randomUUID(), {}).expect(200);

        const response = await decide(requestId, 'reject', randomUUID(), {
          reviewReason: 'Changed my mind',
        }).expect(409);

        expect(response.body).toMatchObject({ code: ErrorCode.REQUEST_ALREADY_DECIDED });
        expect(await readStoredRequest(requestId)).toMatchObject({
          status: 'APPROVED',
          appliedRevision: 2,
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should refuse an approval of a rejected request with 409 and leave the day unchanged',
      async () => {
        const employee = randomUUID();
        const requestId = await submitCorrection(employee, presentBody());
        await decide(requestId, 'reject', randomUUID(), { reviewReason: 'Not accurate' }).expect(
          200,
        );

        const response = await decide(requestId, 'approve', randomUUID(), {}).expect(409);

        expect(response.body).toMatchObject({ code: ErrorCode.REQUEST_ALREADY_DECIDED });
        expect(await readStoredRequest(requestId)).toMatchObject({ status: 'REJECTED' });
        expect(await readDay(employee, TUESDAY)).toMatchObject({
          revision: 1,
          dayStatus: 'PENDING',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 404 REQUEST_NOT_FOUND when no request has the ID',
      async () => {
        const response = await decide(randomUUID(), 'approve', randomUUID(), {}).expect(404);

        expect(response.body).toMatchObject({ statusCode: 404, code: ErrorCode.REQUEST_NOT_FOUND });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 400 when the ID is not a UUID',
      async () => {
        await decide('not-a-uuid', 'approve', randomUUID(), {}).expect(400);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('concurrent decisions', () => {
    it(
      'should let exactly one of a concurrent approve and reject win and leave the row consistent with the winner',
      async () => {
        const approver = randomUUID();
        const rejecter = randomUUID();
        const employee = randomUUID();
        const requestId = await submitCorrection(employee, presentBody());

        const [approval, rejection] = await Promise.all([
          decide(requestId, 'approve', approver, {}),
          decide(requestId, 'reject', rejecter, { reviewReason: 'Concurrent' }),
        ]);

        const statuses = [approval.status, rejection.status].sort();
        expect(statuses).toEqual([200, 409]);
        const winner: CorrectionRequest = approval.status === 200 ? approval.body : rejection.body;
        const stored = await readStoredRequest(requestId);
        expect(stored).toMatchObject({
          status: winner.status,
          reviewedByAccountId: winner.status === 'APPROVED' ? approver : rejecter,
          reviewReason: winner.reviewReason,
        });
        expect(await readDay(employee, TUESDAY)).toMatchObject({
          revision: winner.status === 'APPROVED' ? 2 : 1,
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should answer both of two concurrent identical approvals with 200 and apply the day once',
      async () => {
        const employee = randomUUID();
        const requestId = await submitCorrection(employee, presentBody());

        const responses = await Promise.all([
          decide(requestId, 'approve', randomUUID(), {}),
          decide(requestId, 'approve', randomUUID(), {}),
        ]);

        expect(responses.map((response) => response.status)).toEqual([200, 200]);
        expect(responses[0]?.body).toEqual(responses[1]?.body);
        expect(await readDay(employee, TUESDAY)).toMatchObject({ revision: 2 });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should keep the request and the day consistent when an approval races a punch on the same day',
      async () => {
        const employee = randomUUID();
        const requestId = await submitCorrection(
          employee,
          presentBody({
            businessDate: RACE_BUSINESS_DATE,
            clockInAt: '2031-03-04T01:30:00Z',
            clockOutAt: '2031-03-04T10:00:00Z',
          }),
          { at: RACE_SUBMIT_MOMENT },
        );
        const dayBeforeRace = await readDay(employee, RACE_BUSINESS_DATE);

        const [approval, punch] = await Promise.all([
          decide(requestId, 'approve', randomUUID(), {}, Role.HR, RACE_MOMENT),
          punchIn(employee, RACE_MOMENT),
        ]);

        expect(punch.status).toBe(201);
        const stored = await readStoredRequest(requestId);
        const day = await readDay(employee, RACE_BUSINESS_DATE);
        expect(dayBeforeRace.revision).toBe(1);
        if (approval.status === 200) {
          // The approval took the day first, so the punch then advanced the revision the approval produced.
          expect(stored).toMatchObject({ status: 'APPROVED', appliedRevision: 2 });
          expect(day.revision).toBe(3);
        } else {
          // The punch took the day first, so the approval found a changed day and wrote nothing.
          expect(approval.status).toBe(409);
          expect(approval.body).toMatchObject({ code: ErrorCode.ATTENDANCE_DAY_CHANGED });
          expect(stored).toMatchObject({ status: 'PENDING', appliedRevision: null });
          expect(day.revision).toBe(2);
        }
        expect(await readEntries(day.id)).toEqual([{ type: 'IN', recordedAt: RACE_MOMENT }]);
      },
      TEST_TIMEOUT_MS,
    );
  });
});
