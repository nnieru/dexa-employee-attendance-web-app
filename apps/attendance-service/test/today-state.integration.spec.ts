import { randomUUID } from 'node:crypto';
import { CLOCK, configureApp, parseConfig, type IClock, ServiceName } from '@dexa/common';
import { Role, todayAttendanceResponseSchema } from '@dexa/contracts';
import type { Database } from '@dexa/db';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { createAppModule } from '../src/app.module.js';
import { AttendanceServiceConfigSchema } from '../src/config/attendance-service-config.schema.js';
import { DATABASE } from '../src/infrastructure/db/database.token.js';
import {
  attendanceDays,
  workCalendarDates,
  workSchedules,
  type AttendanceDayRow,
} from '../src/infrastructure/db/schema.js';
import type { AuthKeySet } from './auth-key-set.js';
import {
  forgeGatewayUserToken,
  signEndUserJwt,
  signGatewayUserToken,
} from './gateway-user-token.js';
import {
  attendanceServiceAuthKeys,
  attendanceServiceEnvironment,
} from './attendance-service-environment.js';
import { CONTAINER_TIMEOUT_MS, TEST_TIMEOUT_MS, createEmptyDatabaseUri } from './test-database.js';

// The lifetime of the token api-gateway sends for a call (D-51).
const TOKEN_LIFETIME_SECONDS = 60;

const TODAY_PATH = '/api/v1/attendance/me/today';
const CLOCK_IN_PATH = '/api/v1/attendance/clock-in';
const CLOCK_OUT_PATH = '/api/v1/attendance/clock-out';
// The default schedule is seeded from the first start, so the seed takes effect on this Monday (WIB).
const FIRST_START_INSTANT = new Date('2026-11-02T01:00:00Z');
const MONDAY = '2026-11-02';
const TUESDAY = '2026-11-03';
// Monday instants in UTC: 09:00 WIB is 02:00Z, 09:30 WIB a late check-in, 18:00 WIB the scheduled end (11:00Z).
const MONDAY_SCHEDULED_START_UTC = '2026-11-02T02:00:00.000Z';
const MONDAY_SCHEDULED_END_UTC = '2026-11-02T11:00:00.000Z';
const MONDAY_LATE_CHECKIN_INSTANT = new Date('2026-11-02T02:30:00Z');
const MONDAY_ON_TIME_CHECKOUT_INSTANT = new Date('2026-11-02T11:00:00Z');
const SATURDAY_INSTANT = new Date('2026-11-07T02:00:00Z');
const WEDNESDAY_HOLIDAY = '2026-11-04';
const WEDNESDAY_INSTANT = new Date('2026-11-04T02:00:00Z');
const SUNDAY_BEFORE_SEED_INSTANT = new Date('2026-11-01T02:00:00Z');
const TUESDAY_ON_TIME_CHECKIN_INSTANT = new Date('2026-11-03T02:00:00Z');
const TUESDAY_BEFORE_PUNCH_INSTANT = new Date('2026-11-03T01:00:00Z');
const TUESDAY_AFTER_SUCCESSOR_INSTANT = new Date('2026-11-03T03:00:00Z');

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

function getToday(accessToken: string | undefined) {
  const pending = request(app.getHttpServer()).get(TODAY_PATH);
  if (accessToken !== undefined) pending.set('Authorization', `Bearer ${accessToken}`);
  return pending;
}

async function clockInAs(accountId: string, instant: Date): Promise<void> {
  mutableClock.current = instant;
  await request(app.getHttpServer())
    .post(CLOCK_IN_PATH)
    .set('Authorization', `Bearer ${tokenFor(accountId)}`)
    .expect(201);
}

async function clockOutAs(accountId: string, instant: Date): Promise<void> {
  mutableClock.current = instant;
  await request(app.getHttpServer())
    .post(CLOCK_OUT_PATH)
    .set('Authorization', `Bearer ${tokenFor(accountId)}`)
    .expect(201);
}

async function readDays(accountId: string): Promise<AttendanceDayRow[]> {
  return database.db.select().from(attendanceDays).where(eq(attendanceDays.accountId, accountId));
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

describe('attendance today state', () => {
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
    mutableClock.current = FIRST_START_INSTANT;
  });

  // Only api-gateway verifies end-user tokens (D-51), so this service refuses anything else on the route.
  it(
    'should return 401 when an end-user JWT is sent instead of a gateway token',
    async () => {
      const endUserJwt = signEndUserJwt(keys, randomUUID(), Role.EMPLOYEE);

      const response = await getToday(endUserJwt).expect(401);

      expect(response.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 when a token names api-gateway but another service key signs it',
    async () => {
      const forged = forgeGatewayUserToken(
        keys,
        ServiceName.ATTENDANCE_SERVICE,
        randomUUID(),
        Role.EMPLOYEE,
      );

      const response = await getToday(forged).expect(401);

      expect(response.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should answer not clocked in with the version in effect and write nothing when the employee has not clocked in on a working day',
    async () => {
      const accountId = registerAccount();
      mutableClock.current = MONDAY_LATE_CHECKIN_INSTANT;

      const response = await getToday(tokenFor(accountId)).expect(200);

      expect(todayAttendanceResponseSchema.parse(response.body)).toEqual({
        businessDate: MONDAY,
        isWorkingDay: true,
        scheduledStartAt: MONDAY_SCHEDULED_START_UTC,
        scheduledEndAt: MONDAY_SCHEDULED_END_UTC,
        state: { status: 'NOT_CLOCKED_IN' },
      });
      expect(await readDays(accountId)).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should answer clocked in with the check-in and its classification after the employee clocks in',
    async () => {
      const accountId = registerAccount();
      await clockInAs(accountId, MONDAY_LATE_CHECKIN_INSTANT);
      mutableClock.current = new Date('2026-11-02T03:00:00Z');

      const response = await getToday(tokenFor(accountId)).expect(200);

      expect(todayAttendanceResponseSchema.parse(response.body)).toEqual({
        businessDate: MONDAY,
        isWorkingDay: true,
        scheduledStartAt: MONDAY_SCHEDULED_START_UTC,
        scheduledEndAt: MONDAY_SCHEDULED_END_UTC,
        state: {
          status: 'CLOCKED_IN',
          clockInAt: '2026-11-02T02:30:00.000Z',
          clockInStatus: 'LATE_CHECKIN',
        },
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should answer done with both punches and their classifications after the employee clocks out',
    async () => {
      const accountId = registerAccount();
      await clockInAs(accountId, MONDAY_LATE_CHECKIN_INSTANT);
      await clockOutAs(accountId, MONDAY_ON_TIME_CHECKOUT_INSTANT);
      mutableClock.current = new Date('2026-11-02T11:30:00Z');

      const response = await getToday(tokenFor(accountId)).expect(200);

      expect(todayAttendanceResponseSchema.parse(response.body)).toEqual({
        businessDate: MONDAY,
        isWorkingDay: true,
        scheduledStartAt: MONDAY_SCHEDULED_START_UTC,
        scheduledEndAt: MONDAY_SCHEDULED_END_UTC,
        state: {
          status: 'DONE',
          clockInAt: '2026-11-02T02:30:00.000Z',
          clockInStatus: 'LATE_CHECKIN',
          clockOutAt: '2026-11-02T11:00:00.000Z',
          clockOutStatus: 'ON_TIME_CHECKOUT',
        },
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should answer a day off with null scheduled instants when the date is a weekend',
    async () => {
      const accountId = registerAccount();
      mutableClock.current = SATURDAY_INSTANT;

      const response = await getToday(tokenFor(accountId)).expect(200);

      expect(response.body).toEqual({
        businessDate: '2026-11-07',
        isWorkingDay: false,
        scheduledStartAt: null,
        scheduledEndAt: null,
        state: { status: 'NOT_CLOCKED_IN' },
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should answer a day off with null scheduled instants when a calendar holiday falls on a weekday',
    async () => {
      const accountId = registerAccount();
      await database.db.insert(workCalendarDates).values({
        businessDate: WEDNESDAY_HOLIDAY,
        isWorkingDay: false,
        description: 'Test holiday',
      });
      mutableClock.current = WEDNESDAY_INSTANT;

      const response = await getToday(tokenFor(accountId)).expect(200);

      expect(response.body).toEqual({
        businessDate: WEDNESDAY_HOLIDAY,
        isWorkingDay: false,
        scheduledStartAt: null,
        scheduledEndAt: null,
        state: { status: 'NOT_CLOCKED_IN' },
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should answer only the state fields and no grace values when the employee has clocked in',
    async () => {
      const accountId = registerAccount();
      await clockInAs(accountId, MONDAY_LATE_CHECKIN_INSTANT);
      mutableClock.current = new Date('2026-11-02T03:00:00Z');

      const response = await getToday(tokenFor(accountId)).expect(200);

      expect(Object.keys(response.body).sort()).toEqual([
        'businessDate',
        'isWorkingDay',
        'scheduledEndAt',
        'scheduledStartAt',
        'state',
      ]);
      expect(JSON.stringify(response.body)).not.toMatch(/grace/i);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 UNAUTHORIZED when no bearer token is sent',
    async () => {
      const response = await getToday(undefined).expect(401);

      expect(response.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 409 SCHEDULE_NOT_CONFIGURED and write nothing when no schedule covers today',
    async () => {
      const accountId = registerAccount();
      // The seeded version starts on Monday, so Sunday has no schedule in effect.
      mutableClock.current = SUNDAY_BEFORE_SEED_INSTANT;

      const response = await getToday(tokenFor(accountId)).expect(409);

      expect(response.body).toMatchObject({
        statusCode: 409,
        code: 'SCHEDULE_NOT_CONFIGURED',
        message: 'Work schedule not found.',
      });
      expect(await readDays(accountId)).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  // Runs last because it changes the schedule from Tuesday on. The other tests above never use a date from Tuesday on.
  it(
    'should keep the day snapshot in the answer after the first punch when the schedule in effect changes the same day',
    async () => {
      const punchedEmployeeId = registerAccount();
      const otherEmployeeId = registerAccount();
      await clockInAs(punchedEmployeeId, TUESDAY_ON_TIME_CHECKIN_INSTANT);

      // Supersede the seeded version at Tuesday and open a successor from Tuesday that starts at 08:00 and ends at
      // 17:00 WIB. HR creates versions through the API, so this change is made directly in SQL.
      const [seededVersion] = await database.db
        .select()
        .from(workSchedules)
        .where(eq(workSchedules.effectiveFrom, MONDAY));
      if (seededVersion === undefined) throw new Error('The seeded schedule version is missing.');
      await database.db
        .update(workSchedules)
        .set({ effectiveUntil: TUESDAY })
        .where(eq(workSchedules.id, seededVersion.id));
      await database.db.insert(workSchedules).values({
        name: 'Successor schedule',
        timezone: 'Asia/Jakarta',
        workingWeekdays: [1, 2, 3, 4, 5],
        startTime: '08:00',
        endTime: '17:00',
        lateCheckinGraceMinutes: 15,
        earlyCheckoutGraceMinutes: 0,
        lateCheckoutGraceMinutes: 0,
        effectiveFrom: TUESDAY,
        effectiveUntil: null,
      });

      // An employee who has not punched yet sees the successor's hours for Tuesday (08:00 to 17:00 WIB).
      mutableClock.current = TUESDAY_BEFORE_PUNCH_INSTANT;
      const beforePunch = await getToday(tokenFor(otherEmployeeId)).expect(200);
      expect(beforePunch.body).toMatchObject({
        businessDate: TUESDAY,
        scheduledStartAt: '2026-11-03T01:00:00.000Z',
        scheduledEndAt: '2026-11-03T10:00:00.000Z',
      });

      // The punched employee keeps the seeded hours (09:00 to 18:00 WIB) that were in effect at the first punch.
      mutableClock.current = TUESDAY_AFTER_SUCCESSOR_INSTANT;
      const afterPunch = await getToday(tokenFor(punchedEmployeeId)).expect(200);

      expect(todayAttendanceResponseSchema.parse(afterPunch.body)).toEqual({
        businessDate: TUESDAY,
        isWorkingDay: true,
        scheduledStartAt: '2026-11-03T02:00:00.000Z',
        scheduledEndAt: '2026-11-03T11:00:00.000Z',
        state: {
          status: 'CLOCKED_IN',
          clockInAt: '2026-11-03T02:00:00.000Z',
          clockInStatus: 'ON_TIME_CHECKIN',
        },
      });
      const [day] = await readDays(punchedEmployeeId);
      expect(day?.scheduledEndAt?.toISOString()).toBe('2026-11-03T11:00:00.000Z');
    },
    TEST_TIMEOUT_MS,
  );
});
