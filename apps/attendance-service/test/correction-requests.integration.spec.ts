import { randomUUID } from 'node:crypto';
import { CLOCK, configureApp, parseConfig, ServiceName, type IClock } from '@dexa/common';
import { correctionRequestSchema, Role } from '@dexa/contracts';
import type { Database } from '@dexa/db';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { alias } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { createAppModule } from '../src/app.module.js';
import { AttendanceServiceConfigSchema } from '../src/config/attendance-service-config.schema.js';
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
const TOKEN_LIFETIME_SECONDS = 60;
// The default schedule takes effect on this Monday (WIB) and is 09:00 to 18:00 on working days.
const FIRST_START_INSTANT = new Date('2026-11-02T01:00:00Z');
const MONDAY = '2026-11-02';
const TUESDAY = '2026-11-03';
const WEDNESDAY = '2026-11-04';
const SATURDAY = '2026-11-07';
// The clock is shared by every test, so each test sets the instant it needs.
const mutableClock: { current: Date } = { current: FIRST_START_INSTANT };
const fixedClock: IClock = { now: () => new Date(mutableClock.current) };

let container: StartedPostgreSqlContainer;
let app: INestApplication;
let database: Database;
let keys: AuthKeySet;

function tokenFor(accountId: string, role: Role = Role.EMPLOYEE): string {
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECONDS;
  return signGatewayUserToken(keys, ServiceName.ATTENDANCE_SERVICE, accountId, role, expiresAt);
}

// Every submission gets a fresh key unless the test sends one, so a test never replays another test's request.
function presentBody(overrides: Record<string, unknown> = {}) {
  return {
    requestedDayStatus: 'PRESENT',
    businessDate: TUESDAY,
    clockInAt: '2026-11-03T09:00:00+07:00',
    clockOutAt: '2026-11-03T17:00:00+07:00',
    reason: 'Forgot to clock in',
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

function leaveBody(overrides: Record<string, unknown> = {}) {
  return {
    requestedDayStatus: 'SICK_LEAVE',
    businessDate: TUESDAY,
    reason: 'Fever, doctor note on file',
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

function postCorrection(accessToken: string | undefined, body: object) {
  const pending = request(app.getHttpServer()).post(SUBMIT_PATH);
  if (accessToken !== undefined) pending.set('Authorization', `Bearer ${accessToken}`);
  return pending.send(body);
}

function clockIn(accessToken: string) {
  return request(app.getHttpServer())
    .post(CLOCK_IN_PATH)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({});
}

async function readDays(accountId: string) {
  return database.db.select().from(attendanceDays).where(eq(attendanceDays.accountId, accountId));
}

async function readEntries(dayId: string) {
  return database.db
    .select()
    .from(attendanceEntries)
    .where(eq(attendanceEntries.attendanceDayId, dayId));
}

async function readCorrections(accountId: string) {
  const requestedStatus = alias(masterAttendanceStatuses, 'requested_status');
  return database.db
    .select({
      id: attendanceAdjustmentRequests.id,
      attendanceDayId: attendanceAdjustmentRequests.attendanceDayId,
      status: attendanceAdjustmentRequests.status,
      baseRevision: attendanceAdjustmentRequests.baseRevision,
      beforeCheckinAt: attendanceAdjustmentRequests.beforeCheckinAt,
      beforeCheckoutAt: attendanceAdjustmentRequests.beforeCheckoutAt,
      beforeDayStatusId: attendanceAdjustmentRequests.beforeDayStatusId,
      requestedCheckinAt: attendanceAdjustmentRequests.requestedCheckinAt,
      requestedCheckoutAt: attendanceAdjustmentRequests.requestedCheckoutAt,
      requestedOutcome: requestedStatus.code,
    })
    .from(attendanceAdjustmentRequests)
    .innerJoin(
      requestedStatus,
      eq(requestedStatus.id, attendanceAdjustmentRequests.requestedDayStatusId),
    )
    .where(eq(attendanceAdjustmentRequests.requestedByAccountId, accountId));
}

async function readStatusCode(statusId: string): Promise<string | undefined> {
  const [row] = await database.db
    .select({ code: masterAttendanceStatuses.code })
    .from(masterAttendanceStatuses)
    .where(eq(masterAttendanceStatuses.id, statusId));
  return row?.code;
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

describe('correction request submission', () => {
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

  beforeEach(() => {
    // 2026-11-04 10:00 WIB, so the business dates below are in the past and no requested time is in the future.
    mutableClock.current = new Date('2026-11-04T03:00:00Z');
  });

  it(
    'should create the day and a pending request, and leave the day without a clock-in, when a correction targets a day with no punch',
    async () => {
      const accountId = randomUUID();

      const response = await postCorrection(tokenFor(accountId), presentBody()).expect(201);

      expect(correctionRequestSchema.parse(response.body)).toMatchObject({
        businessDate: TUESDAY,
        requestedDayStatus: 'PRESENT',
        clockInAt: '2026-11-03T02:00:00.000Z',
        clockOutAt: '2026-11-03T10:00:00.000Z',
        reason: 'Forgot to clock in',
        status: 'PENDING',
      });
      const [day] = await readDays(accountId);
      const dayRow = requireRow(day);
      expect(dayRow).toMatchObject({ isWorkingDay: true, revision: 1 });
      expect(dayRow.effectiveCheckinAt).toBeNull();
      expect(dayRow.effectiveCheckoutAt).toBeNull();
      expect(await readStatusCode(dayRow.dayStatusId)).toBe('PENDING');
      expect(await readEntries(dayRow.id)).toEqual([]);
      const [saved] = await readCorrections(accountId);
      expect(saved).toMatchObject({
        status: 'PENDING',
        baseRevision: 1,
        beforeCheckinAt: null,
        beforeCheckoutAt: null,
        requestedOutcome: 'PRESENT',
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should store a sick leave correction with no times on a day with no punch',
    async () => {
      const accountId = randomUUID();

      const response = await postCorrection(tokenFor(accountId), leaveBody()).expect(201);

      expect(correctionRequestSchema.parse(response.body)).toMatchObject({
        requestedDayStatus: 'SICK_LEAVE',
        clockInAt: null,
        clockOutAt: null,
      });
      const [saved] = await readCorrections(accountId);
      expect(saved).toMatchObject({
        requestedOutcome: 'SICK_LEAVE',
        requestedCheckinAt: null,
        requestedCheckoutAt: null,
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should snapshot the revision and the effective times of a punched day, and leave the punch and the day unchanged',
    async () => {
      const accountId = randomUUID();
      const accessToken = tokenFor(accountId);
      mutableClock.current = new Date('2026-11-04T01:05:00Z');
      await clockIn(accessToken).expect(201);
      const [punchedDay] = await readDays(accountId);
      const punchedRow = requireRow(punchedDay);
      mutableClock.current = new Date('2026-11-04T03:00:00Z');

      await postCorrection(
        accessToken,
        presentBody({
          businessDate: WEDNESDAY,
          clockInAt: '2026-11-04T09:00:00+07:00',
          clockOutAt: undefined,
        }),
      ).expect(201);

      const [saved] = await readCorrections(accountId);
      expect(saved).toMatchObject({
        baseRevision: punchedRow.revision,
        beforeCheckoutAt: null,
        requestedCheckoutAt: null,
      });
      expect(saved?.beforeCheckinAt?.toISOString()).toBe('2026-11-04T01:05:00.000Z');
      expect(saved?.beforeDayStatusId).toBe(punchedRow.dayStatusId);
      expect(await readCorrections(accountId)).toHaveLength(1);
      const [dayAfter] = await readDays(accountId);
      expect(requireRow(dayAfter)).toMatchObject({
        revision: punchedRow.revision,
        effectiveCheckinAt: punchedRow.effectiveCheckinAt,
      });
      const entries = await readEntries(punchedRow.id);
      expect(entries.map((entry) => [entry.type, entry.recordedAt.toISOString()])).toEqual([
        ['IN', '2026-11-04T01:05:00.000Z'],
      ]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should accept a date 30 days back, the last date inside the window',
    async () => {
      const accountId = randomUUID();
      // 2026-11-03 is 30 days before 2026-12-03 (WIB).
      mutableClock.current = new Date('2026-12-03T03:00:00Z');

      await postCorrection(
        tokenFor(accountId),
        presentBody({
          businessDate: TUESDAY,
          clockInAt: '2026-11-03T09:00:00+07:00',
          clockOutAt: undefined,
        }),
      ).expect(201);

      expect(await readCorrections(accountId)).toHaveLength(1);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 400 CORRECTION_BUSINESS_DATE_OUTSIDE_WINDOW and write nothing when the date is 31 days back',
    async () => {
      const accountId = randomUUID();
      // 2026-11-02 is 31 days before 2026-12-03 (WIB).
      mutableClock.current = new Date('2026-12-03T03:00:00Z');

      const response = await postCorrection(
        tokenFor(accountId),
        presentBody({
          businessDate: MONDAY,
          clockInAt: '2026-11-02T09:00:00+07:00',
          clockOutAt: undefined,
        }),
      ).expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        code: 'CORRECTION_BUSINESS_DATE_OUTSIDE_WINDOW',
      });
      expect(await readDays(accountId)).toEqual([]);
      expect(await readCorrections(accountId)).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 400 CORRECTION_CLOCK_IN_IN_FUTURE and write nothing when the clock-in is after now',
    async () => {
      const accountId = randomUUID();

      const response = await postCorrection(
        tokenFor(accountId),
        presentBody({ businessDate: WEDNESDAY, clockInAt: '2026-11-04T15:00:00+07:00' }),
      ).expect(400);

      expect(response.body).toMatchObject({ code: 'CORRECTION_CLOCK_IN_IN_FUTURE' });
      expect(await readDays(accountId)).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 400 CORRECTION_CLOCK_OUT_IN_FUTURE when the clock-out is after now',
    async () => {
      const accountId = randomUUID();

      const response = await postCorrection(
        tokenFor(accountId),
        presentBody({
          businessDate: WEDNESDAY,
          clockInAt: '2026-11-04T09:00:00+07:00',
          clockOutAt: '2026-11-04T15:00:00+07:00',
        }),
      ).expect(400);

      expect(response.body).toMatchObject({ code: 'CORRECTION_CLOCK_OUT_IN_FUTURE' });
      expect(await readCorrections(accountId)).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 400 CORRECTION_CLOCK_OUT_NOT_AFTER_CLOCK_IN and write nothing when the clock-out equals the clock-in',
    async () => {
      const accountId = randomUUID();

      const response = await postCorrection(
        tokenFor(accountId),
        presentBody({
          businessDate: TUESDAY,
          clockInAt: '2026-11-03T09:00:00+07:00',
          clockOutAt: '2026-11-03T09:00:00+07:00',
        }),
      ).expect(400);

      expect(response.body).toMatchObject({ code: 'CORRECTION_CLOCK_OUT_NOT_AFTER_CLOCK_IN' });
      expect(await readCorrections(accountId)).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 400 VALIDATION_FAILED and write nothing when a sick leave correction carries a clock-in',
    async () => {
      const accountId = randomUUID();

      const response = await postCorrection(
        tokenFor(accountId),
        leaveBody({ clockInAt: '2026-11-03T09:00:00+07:00' }),
      ).expect(400);

      expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
      expect(await readDays(accountId)).toEqual([]);
      expect(await readCorrections(accountId)).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 400 VALIDATION_FAILED when the body names the requester',
    async () => {
      const accountId = randomUUID();

      const response = await postCorrection(
        tokenFor(accountId),
        presentBody({ requestedByAccountId: randomUUID() }),
      ).expect(400);

      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(await readCorrections(accountId)).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 and write nothing when the request has no gateway token',
    async () => {
      const accountId = randomUUID();

      await postCorrection(undefined, presentBody()).expect(401);

      expect(await readCorrections(accountId)).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should accept HR as a requester the same way as an employee',
    async () => {
      const accountId = randomUUID();

      await postCorrection(tokenFor(accountId, Role.HR), leaveBody()).expect(201);

      expect(await readCorrections(accountId)).toHaveLength(1);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should create a day-off day with no scheduled times when the correction is for a Saturday',
    async () => {
      const accountId = randomUUID();
      mutableClock.current = new Date('2026-11-07T05:00:00Z');

      await postCorrection(tokenFor(accountId), leaveBody({ businessDate: SATURDAY })).expect(201);

      const [day] = await readDays(accountId);
      const dayRow = requireRow(day);
      expect(dayRow).toMatchObject({ isWorkingDay: false, scheduledStartAt: null });
      expect(await readStatusCode(dayRow.dayStatusId)).toBe('DAY_OFF');
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 409 CORRECTION_ALREADY_PENDING and store nothing new when a second pending correction targets the same day',
    async () => {
      const accountId = randomUUID();
      const accessToken = tokenFor(accountId);
      await postCorrection(accessToken, presentBody()).expect(201);

      const response = await postCorrection(accessToken, leaveBody()).expect(409);

      expect(response.body).toMatchObject({ statusCode: 409, code: 'CORRECTION_ALREADY_PENDING' });
      expect(await readCorrections(accountId)).toHaveLength(1);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should store exactly one pending correction when two different corrections for one day are sent concurrently',
    async () => {
      const accountId = randomUUID();
      const accessToken = tokenFor(accountId);

      const responses = await Promise.all([
        postCorrection(accessToken, presentBody()),
        postCorrection(accessToken, leaveBody()),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
      const refused = responses.find((response) => response.status === 409);
      expect(refused?.body).toMatchObject({ code: 'CORRECTION_ALREADY_PENDING' });
      expect(await readCorrections(accountId)).toHaveLength(1);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return the same request with 200 and store one row when an identical retry reuses the key',
    async () => {
      const accountId = randomUUID();
      const accessToken = tokenFor(accountId);
      const body = presentBody();
      const first = await postCorrection(accessToken, body).expect(201);

      const retry = await postCorrection(accessToken, body).expect(200);

      expect(retry.body).toEqual(first.body);
      expect(await readCorrections(accountId)).toHaveLength(1);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 409 IDEMPOTENCY_KEY_CONFLICT and keep the stored request when the key is reused with other content',
    async () => {
      const accountId = randomUUID();
      const accessToken = tokenFor(accountId);
      const body = presentBody();
      await postCorrection(accessToken, body).expect(201);

      const response = await postCorrection(accessToken, {
        ...body,
        clockOutAt: '2026-11-03T18:00:00+07:00',
      }).expect(409);

      expect(response.body).toMatchObject({ statusCode: 409, code: 'IDEMPOTENCY_KEY_CONFLICT' });
      const [stored] = await readCorrections(accountId);
      expect(stored?.requestedCheckoutAt?.toISOString()).toBe('2026-11-03T10:00:00.000Z');
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should store one request when one key is sent concurrently for two dates',
    async () => {
      const accountId = randomUUID();
      const accessToken = tokenFor(accountId);
      const idempotencyKey = randomUUID();

      const responses = await Promise.all([
        postCorrection(accessToken, leaveBody({ idempotencyKey, businessDate: TUESDAY })),
        postCorrection(accessToken, leaveBody({ idempotencyKey, businessDate: WEDNESDAY })),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
      const refused = responses.find((response) => response.status === 409);
      expect(refused?.body).toMatchObject({ code: 'IDEMPOTENCY_KEY_CONFLICT' });
      expect(await readCorrections(accountId)).toHaveLength(1);
    },
    TEST_TIMEOUT_MS,
  );
});
