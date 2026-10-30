import { Buffer } from 'node:buffer';
import { createSign, randomUUID } from 'node:crypto';
import {
  ACCOUNT_STATUS_READER,
  CLOCK,
  configureApp,
  parseConfig,
  type IAccountStatusReader,
  type IClock,
} from '@dexa/common';
import { clockOutResponseSchema, Role, type AccountStatus } from '@dexa/contracts';
import type { Database } from '@dexa/db';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import { createAppModule } from '../src/app.module.js';
import { AttendanceServiceConfigSchema } from '../src/config/attendance-service-config.schema.js';
import { DATABASE } from '../src/infrastructure/db/database.token.js';
import {
  attendanceDays,
  attendanceEntries,
  masterAttendanceStatuses,
  workSchedules,
  type AttendanceDayRow,
} from '../src/infrastructure/db/schema.js';
import { USER_JWT_AUDIENCE, USER_JWT_ISSUER, type AuthKeySet } from './auth-key-set.js';
import {
  attendanceServiceAuthKeys,
  attendanceServiceEnvironment,
} from './attendance-service-environment.js';
import {
  CONTAINER_TIMEOUT_MS,
  TEST_TIMEOUT_MS,
  createEmptyDatabaseUri,
  requireRow,
} from './test-database.js';

const CLOCK_IN_PATH = '/api/v1/attendance/clock-in';
const CLOCK_OUT_PATH = '/api/v1/attendance/clock-out';
const TOKEN_LIFETIME_SECONDS = 300;
// The default schedule is seeded from the first start, so the seed takes effect on this Monday (WIB).
const FIRST_START_INSTANT = new Date('2026-11-02T01:00:00Z');
const MONDAY = '2026-11-02';
const TUESDAY = '2026-11-03';
// Monday instants in UTC: 09:30 WIB is a late check-in, 18:00 WIB is the scheduled end, 18:30 WIB is after the end.
const MONDAY_LATE_CHECKIN_INSTANT = new Date('2026-11-02T02:30:00Z');
const MONDAY_ON_TIME_CHECKOUT_INSTANT = new Date('2026-11-02T11:00:00Z');
const MONDAY_SECOND_CHECKOUT_INSTANT = new Date('2026-11-02T11:30:00Z');

// Stands in for auth-service. The clock is shared across tests, so each test sets the instant it needs.
const accountStatuses = new Map<string, AccountStatus>();
const fakeAccountStatusReader: IAccountStatusReader = {
  findAccountStatus: (accountId) => Promise.resolve(accountStatuses.get(accountId)),
};
const mutableClock: { current: Date } = { current: FIRST_START_INSTANT };
const fixedClock: IClock = { now: () => new Date(mutableClock.current) };

let container: StartedPostgreSqlContainer;
let app: INestApplication;
let database: Database;
let keys: AuthKeySet;

function encodeJsonSegment(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

// Signs a user token with the test user key. Only auth-service holds that key in production.
function signUserToken(accountId: string, role: Role, expiresAtSeconds: number): string {
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

function tokenFor(accountId: string, role: Role = Role.EMPLOYEE): string {
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECONDS;
  return signUserToken(accountId, role, expiresAt);
}

function registerAccount(options: { readonly isActive?: boolean } = {}): string {
  const accountId = randomUUID();
  accountStatuses.set(accountId, { isActive: options.isActive ?? true });
  return accountId;
}

function postClockIn(accessToken: string | undefined) {
  const pending = request(app.getHttpServer()).post(CLOCK_IN_PATH);
  if (accessToken !== undefined) pending.set('Authorization', `Bearer ${accessToken}`);
  return pending;
}

function postClockOut(accessToken: string | undefined, body?: object) {
  const pending = request(app.getHttpServer()).post(CLOCK_OUT_PATH);
  if (accessToken !== undefined) pending.set('Authorization', `Bearer ${accessToken}`);
  return body === undefined ? pending : pending.send(body);
}

async function readDays(accountId: string): Promise<AttendanceDayRow[]> {
  return database.db.select().from(attendanceDays).where(eq(attendanceDays.accountId, accountId));
}

// The tests create one day per account, so the single row is the account's day for the business date.
async function readOnlyDay(accountId: string): Promise<AttendanceDayRow | undefined> {
  const days = await readDays(accountId);
  expect(days).toHaveLength(1);
  return days[0];
}

async function readEntryTypes(dayId: string): Promise<string[]> {
  const rows = await database.db
    .select({ type: attendanceEntries.type })
    .from(attendanceEntries)
    .where(eq(attendanceEntries.attendanceDayId, dayId));
  return rows.map((row) => row.type).sort();
}

// The day stores status ids. The codes are read back so a test asserts the status a person would see.
async function readStatusCodes(day: AttendanceDayRow) {
  const rows = await database.db
    .select({ id: masterAttendanceStatuses.id, code: masterAttendanceStatuses.code })
    .from(masterAttendanceStatuses)
    .where(
      inArray(masterAttendanceStatuses.id, [
        day.dayStatusId,
        day.checkinStatusId,
        day.checkoutStatusId,
      ]),
    );
  const codeById = new Map(rows.map((row) => [row.id, row.code]));
  return {
    dayStatus: codeById.get(day.dayStatusId),
    checkinStatus: codeById.get(day.checkinStatusId),
    checkoutStatus: codeById.get(day.checkoutStatusId),
  };
}

async function clockInAs(accountId: string, instant: Date): Promise<void> {
  mutableClock.current = instant;
  await postClockIn(tokenFor(accountId)).expect(201);
}

async function startApp(databaseUrl: string): Promise<INestApplication> {
  const config = parseConfig(
    AttendanceServiceConfigSchema,
    attendanceServiceEnvironment({ ATTENDANCE_DATABASE_URL: databaseUrl }),
  );
  const moduleRef = await Test.createTestingModule({ imports: [createAppModule(config)] })
    .overrideProvider(CLOCK)
    .useValue(fixedClock)
    .overrideProvider(ACCOUNT_STATUS_READER)
    .useValue(fakeAccountStatusReader)
    .compile();
  const nestApp = moduleRef.createNestApplication();
  configureApp(nestApp, { CORS_ORIGINS: [] });
  await nestApp.init();
  database = moduleRef.get<Database>(DATABASE);
  return nestApp;
}

describe('attendance clock out', () => {
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

  it(
    'should record the check-out and return its classification when the employee clocks out after clocking in',
    async () => {
      const accountId = registerAccount();
      await clockInAs(accountId, MONDAY_LATE_CHECKIN_INSTANT);
      mutableClock.current = MONDAY_ON_TIME_CHECKOUT_INSTANT;

      const response = await postClockOut(tokenFor(accountId)).expect(201);

      expect(clockOutResponseSchema.parse(response.body)).toEqual({
        type: 'OUT',
        recordedAt: '2026-11-02T11:00:00.000Z',
        businessDate: MONDAY,
        classification: 'ON_TIME_CHECKOUT',
      });
      const day = requireRow(await readOnlyDay(accountId));
      expect(day).toMatchObject({
        businessDate: MONDAY,
        revision: 3,
      });
      expect(day.effectiveCheckoutAt?.toISOString()).toBe('2026-11-02T11:00:00.000Z');
      expect(await readStatusCodes(day)).toEqual({
        dayStatus: 'PRESENT',
        checkinStatus: 'LATE_CHECKIN',
        checkoutStatus: 'ON_TIME_CHECKOUT',
      });
      expect(await readEntryTypes(day.id)).toEqual(['IN', 'OUT']);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 400 ATTENDANCE_NOT_CLOCKED_IN and write nothing when the employee clocks out before clocking in',
    async () => {
      const accountId = registerAccount();
      mutableClock.current = MONDAY_ON_TIME_CHECKOUT_INSTANT;

      const response = await postClockOut(tokenFor(accountId)).expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        code: 'ATTENDANCE_NOT_CLOCKED_IN',
        message: expect.stringContaining('not clocked in'),
      });
      expect(await readDays(accountId)).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 409 SCHEDULE_NOT_CONFIGURED and write nothing when no schedule covers the business date, before the not-clocked-in check',
    async () => {
      const accountId = registerAccount();
      // The seeded version starts on Monday, so Sunday has no schedule in effect and no check-in either.
      mutableClock.current = new Date('2026-11-01T02:00:00Z');

      const response = await postClockOut(tokenFor(accountId)).expect(409);

      expect(response.body).toMatchObject({
        statusCode: 409,
        code: 'SCHEDULE_NOT_CONFIGURED',
        message: 'Work schedule not found. The punch was not recorded.',
      });
      expect(await readDays(accountId)).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 409 ATTENDANCE_ALREADY_CLOCKED_OUT and keep the first check-out when the employee clocks out again the same day',
    async () => {
      const accountId = registerAccount();
      const accessToken = tokenFor(accountId);
      await clockInAs(accountId, MONDAY_LATE_CHECKIN_INSTANT);
      mutableClock.current = MONDAY_ON_TIME_CHECKOUT_INSTANT;
      await postClockOut(accessToken).expect(201);
      mutableClock.current = MONDAY_SECOND_CHECKOUT_INSTANT;

      const response = await postClockOut(accessToken).expect(409);

      expect(response.body).toMatchObject({
        statusCode: 409,
        code: 'ATTENDANCE_ALREADY_CLOCKED_OUT',
      });
      const day = requireRow(await readOnlyDay(accountId));
      expect(day.effectiveCheckoutAt?.toISOString()).toBe('2026-11-02T11:00:00.000Z');
      expect(day.revision).toBe(3);
      expect(await readEntryTypes(day.id)).toEqual(['IN', 'OUT']);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should record the check-out when the request has no body',
    async () => {
      const accountId = registerAccount();
      await clockInAs(accountId, MONDAY_LATE_CHECKIN_INSTANT);
      mutableClock.current = MONDAY_ON_TIME_CHECKOUT_INSTANT;

      await request(app.getHttpServer())
        .post(CLOCK_OUT_PATH)
        .set('Authorization', `Bearer ${tokenFor(accountId)}`)
        .expect(201);

      const day = requireRow(await readOnlyDay(accountId));
      expect(await readStatusCodes(day)).toMatchObject({ checkoutStatus: 'ON_TIME_CHECKOUT' });
      expect(await readEntryTypes(day.id)).toEqual(['IN', 'OUT']);
    },
    TEST_TIMEOUT_MS,
  );

  it.each([
    { field: 'recordedAt', value: '2026-11-02T11:00:00Z' },
    { field: 'businessDate', value: '2026-11-02' },
    { field: 'accountId', value: randomUUID() },
    { field: 'type', value: 'OUT' },
    { field: 'classification', value: 'ON_TIME_CHECKOUT' },
  ])(
    'should return 400 VALIDATION_FAILED and keep the day open when the client sends $field',
    async ({ field, value }) => {
      const accountId = registerAccount();
      await clockInAs(accountId, MONDAY_LATE_CHECKIN_INSTANT);

      const response = await postClockOut(tokenFor(accountId), { [field]: value }).expect(400);

      expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
      const day = requireRow(await readOnlyDay(accountId));
      expect(day.effectiveCheckoutAt).toBeNull();
      expect(await readEntryTypes(day.id)).toEqual(['IN']);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 UNAUTHORIZED when no bearer token is sent',
    async () => {
      const response = await postClockOut(undefined).expect(401);

      expect(response.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should create exactly one OUT entry and answer 201 once and 409 once when two check-outs race',
    async () => {
      const accountId = registerAccount();
      const accessToken = tokenFor(accountId);
      await clockInAs(accountId, MONDAY_LATE_CHECKIN_INSTANT);
      mutableClock.current = MONDAY_ON_TIME_CHECKOUT_INSTANT;

      const [first, second] = await Promise.all([
        postClockOut(accessToken),
        postClockOut(accessToken),
      ]);

      expect([first.status, second.status].sort()).toEqual([201, 409]);
      const conflict = first.status === 409 ? first : second;
      expect(conflict.body).toMatchObject({ code: 'ATTENDANCE_ALREADY_CLOCKED_OUT' });
      const day = requireRow(await readOnlyDay(accountId));
      expect(day.revision).toBe(3);
      expect(await readEntryTypes(day.id)).toEqual(['IN', 'OUT']);
    },
    TEST_TIMEOUT_MS,
  );

  // Runs last because it changes the schedule for Tuesday, which the tests above never use.
  it(
    'should classify the check-out with the day snapshot when a schedule change takes effect later the same day',
    async () => {
      const employeeId = registerAccount();
      const otherEmployeeId = registerAccount();
      // 09:00 WIB, under the seeded version (start 09:00, end 18:00).
      await clockInAs(employeeId, new Date('2026-11-03T02:00:00Z'));
      const [seededVersion] = await database.db
        .select()
        .from(workSchedules)
        .where(eq(workSchedules.effectiveFrom, MONDAY));
      if (seededVersion === undefined) throw new Error('The seeded schedule version is missing.');

      // Supersede the seeded version at Tuesday and open a successor from Tuesday that starts at 08:00 and ends at
      // 17:00 WIB. HR creates versions from tomorrow onward through the API, so this change is made directly in SQL.
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

      // 08:00 WIB is on time under the successor and early under the seeded version, so this check-in shows the
      // successor is the one in effect for the rest of the day.
      mutableClock.current = new Date('2026-11-03T01:00:00Z');
      const successorCheckIn = await postClockIn(tokenFor(otherEmployeeId)).expect(201);
      expect(successorCheckIn.body).toMatchObject({ classification: 'ON_TIME_CHECKIN' });

      // 17:30 WIB is early under the snapshot's 18:00 end, and late under the successor's 17:00 end.
      mutableClock.current = new Date('2026-11-03T10:30:00Z');
      const response = await postClockOut(tokenFor(employeeId)).expect(201);

      expect(response.body).toMatchObject({
        businessDate: TUESDAY,
        classification: 'EARLY_CHECKOUT',
      });
      const day = requireRow(await readOnlyDay(employeeId));
      expect(day).toMatchObject({ workScheduleId: seededVersion.id });
      expect(day.scheduledEndAt?.toISOString()).toBe('2026-11-03T11:00:00.000Z');
    },
    TEST_TIMEOUT_MS,
  );
});
