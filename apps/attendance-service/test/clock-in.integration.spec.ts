import { randomUUID } from 'node:crypto';
import { CLOCK, configureApp, parseConfig, type IClock, ServiceName } from '@dexa/common';
import { clockInResponseSchema, Role } from '@dexa/contracts';
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
  attendanceEntries,
  workCalendarDates,
} from '../src/infrastructure/db/schema.js';
import type { AuthKeySet } from './auth-key-set.js';
import { signGatewayUserToken } from './gateway-user-token.js';
import {
  attendanceServiceAuthKeys,
  attendanceServiceEnvironment,
} from './attendance-service-environment.js';
import { CONTAINER_TIMEOUT_MS, TEST_TIMEOUT_MS, createEmptyDatabaseUri } from './test-database.js';

// The lifetime of the token api-gateway sends for a call.
const TOKEN_LIFETIME_SECONDS = 60;

const CLOCK_IN_PATH = '/api/v1/attendance/clock-in';
// The default schedule is seeded from the first start, so the seed takes effect on this Monday (WIB).
const FIRST_START_INSTANT = new Date('2026-11-02T01:00:00Z');
const HOLIDAY_DATE = '2026-11-03';
const SCHEDULE_START_DATE = '2026-11-02';

// Stands in for auth-service. The clock is shared across tests, so each test sets the instant it needs.
const mutableClock: { current: Date } = { current: FIRST_START_INSTANT };
const fixedClock: IClock = { now: () => new Date(mutableClock.current) };

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

function postClockIn(accessToken: string | undefined, body?: object) {
  const pending = request(app.getHttpServer()).post(CLOCK_IN_PATH);
  if (accessToken !== undefined) pending.set('Authorization', `Bearer ${accessToken}`);
  return body === undefined ? pending : pending.send(body);
}

async function readDays(accountId: string) {
  return database.db.select().from(attendanceDays).where(eq(attendanceDays.accountId, accountId));
}

async function readEntryCount(dayId: string): Promise<number> {
  const rows = await database.db
    .select({ id: attendanceEntries.id })
    .from(attendanceEntries)
    .where(eq(attendanceEntries.attendanceDayId, dayId));
  return rows.length;
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

describe('attendance clock in', () => {
  beforeAll(async () => {
    keys = attendanceServiceAuthKeys();
    container = await new PostgreSqlContainer('postgres:18').start();
    const databaseUrl = await createEmptyDatabaseUri(container.getConnectionUri());
    app = await startApp(databaseUrl);
    await database.db.insert(workCalendarDates).values({
      businessDate: HOLIDAY_DATE,
      isWorkingDay: false,
      description: 'Test holiday',
    });
  }, CONTAINER_TIMEOUT_MS);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  }, CONTAINER_TIMEOUT_MS);

  beforeEach(() => {
    mutableClock.current = FIRST_START_INSTANT;
  });

  it(
    'should record the punch and return the classification when the employee clocks in',
    async () => {
      const accountId = registerAccount();
      mutableClock.current = new Date('2026-11-02T01:30:00Z');

      const response = await postClockIn(tokenFor(accountId)).expect(201);

      expect(clockInResponseSchema.parse(response.body)).toEqual({
        type: 'IN',
        recordedAt: '2026-11-02T01:30:00.000Z',
        businessDate: SCHEDULE_START_DATE,
        classification: 'EARLY_CHECKIN',
      });
      const [day] = await readDays(accountId);
      expect(day).toMatchObject({
        businessDate: SCHEDULE_START_DATE,
        isWorkingDay: true,
        businessTimezone: 'Asia/Jakarta',
        revision: 2,
      });
      expect(day?.effectiveCheckinAt?.toISOString()).toBe('2026-11-02T01:30:00.000Z');
      expect(await readEntryCount(day?.id ?? '')).toBe(1);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 409 ATTENDANCE_ALREADY_CLOCKED_IN and keep the first punch when the employee clocks in again the same day',
    async () => {
      const accountId = registerAccount();
      const accessToken = tokenFor(accountId);
      mutableClock.current = new Date('2026-11-02T01:30:00Z');
      await postClockIn(accessToken).expect(201);
      mutableClock.current = new Date('2026-11-02T02:20:00Z');

      const response = await postClockIn(accessToken).expect(409);

      expect(response.body).toMatchObject({
        statusCode: 409,
        code: 'ATTENDANCE_ALREADY_CLOCKED_IN',
      });
      const [day] = await readDays(accountId);
      expect(day?.revision).toBe(2);
      expect(await readEntryCount(day?.id ?? '')).toBe(1);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should count a punch at 23:59 WIB and one at 00:01 WIB toward different business dates',
    async () => {
      const accountId = registerAccount();
      const accessToken = tokenFor(accountId);
      mutableClock.current = new Date('2026-11-02T16:59:00Z');
      const lastMinute = await postClockIn(accessToken).expect(201);
      mutableClock.current = new Date('2026-11-02T17:01:00Z');
      const firstMinute = await postClockIn(accessToken).expect(201);

      expect(lastMinute.body).toMatchObject({ businessDate: '2026-11-02' });
      expect(firstMinute.body).toMatchObject({ businessDate: '2026-11-03' });
      const days = await readDays(accountId);
      expect(days.map((day) => day.businessDate).sort()).toEqual(['2026-11-02', '2026-11-03']);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should classify a 09:20 WIB punch on a working day as LATE_CHECKIN',
    async () => {
      const accountId = registerAccount();
      mutableClock.current = new Date('2026-11-02T02:20:00Z');

      const response = await postClockIn(tokenFor(accountId)).expect(201);

      expect(response.body).toMatchObject({ classification: 'LATE_CHECKIN' });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should classify a 09:20 WIB punch on a calendar holiday as CHECKIN_NOT_REQUIRED',
    async () => {
      const accountId = registerAccount();
      mutableClock.current = new Date('2026-11-03T02:20:00Z');

      const response = await postClockIn(tokenFor(accountId)).expect(201);

      expect(response.body).toMatchObject({
        businessDate: HOLIDAY_DATE,
        classification: 'CHECKIN_NOT_REQUIRED',
      });
      const [day] = await readDays(accountId);
      expect(day).toMatchObject({
        isWorkingDay: false,
        checkinStatusId: expect.any(String),
        scheduledStartAt: null,
        scheduledEndAt: null,
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 409 SCHEDULE_NOT_CONFIGURED and write nothing when no schedule covers the business date',
    async () => {
      const accountId = registerAccount();
      // 2026-11-01 17:00 WIB is before the seeded version takes effect on 2026-11-02.
      mutableClock.current = new Date('2026-11-01T10:00:00Z');

      const response = await postClockIn(tokenFor(accountId)).expect(409);

      expect(response.body).toMatchObject({ statusCode: 409, code: 'SCHEDULE_NOT_CONFIGURED' });
      expect(await readDays(accountId)).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it.each([
    { field: 'recordedAt', value: '2026-11-02T01:30:00Z' },
    { field: 'businessDate', value: '2026-11-02' },
    { field: 'accountId', value: randomUUID() },
    { field: 'classification', value: 'ON_TIME_CHECKIN' },
  ])(
    'should return 400 VALIDATION_FAILED and write nothing when the client sends $field',
    async ({ field, value }) => {
      const accountId = registerAccount();

      const response = await postClockIn(tokenFor(accountId), { [field]: value }).expect(400);

      expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
      expect(await readDays(accountId)).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should record the punch when the request has no body',
    async () => {
      const accountId = registerAccount();
      mutableClock.current = new Date('2026-11-02T01:30:00Z');

      await postClockIn(tokenFor(accountId)).expect(201);

      expect(await readDays(accountId)).toHaveLength(1);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 UNAUTHORIZED when no bearer token is sent',
    async () => {
      const response = await postClockIn(undefined).expect(401);

      expect(response.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should create one day and one IN entry and answer 201 once and 409 once when two first punches race',
    async () => {
      const accountId = registerAccount();
      const accessToken = tokenFor(accountId);
      mutableClock.current = new Date('2026-11-02T01:30:00Z');

      const [first, second] = await Promise.all([
        postClockIn(accessToken),
        postClockIn(accessToken),
      ]);

      expect([first.status, second.status].sort()).toEqual([201, 409]);
      const days = await readDays(accountId);
      expect(days).toHaveLength(1);
      expect(await readEntryCount(days[0]?.id ?? '')).toBe(1);
    },
    TEST_TIMEOUT_MS,
  );
});
