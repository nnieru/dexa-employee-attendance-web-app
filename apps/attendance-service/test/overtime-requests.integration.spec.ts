import { randomUUID } from 'node:crypto';
import { CLOCK, configureApp, parseConfig, ServiceName, type IClock } from '@dexa/common';
import { overtimeRequestSchema, Role } from '@dexa/contracts';
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
  masterAttendanceStatuses,
  overtimeRequests,
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

const SUBMIT_PATH = '/api/v1/overtime-requests';
const TOKEN_LIFETIME_SECONDS = 60;
// The default schedule takes effect on this Monday (WIB) and is 09:00 to 18:00 on working days.
const FIRST_START_INSTANT = new Date('2026-11-02T01:00:00Z');
const WORKING_DATE = '2026-11-02';
const NEXT_WORKING_DATE = '2026-11-03';
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
function overtimeBody(overrides: Record<string, unknown> = {}) {
  return {
    businessDate: WORKING_DATE,
    startAt: '2026-11-02T18:00:00+07:00',
    endAt: '2026-11-02T20:00:00+07:00',
    reason: 'Release deployment',
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

function postOvertime(accessToken: string | undefined, body: object) {
  const pending = request(app.getHttpServer()).post(SUBMIT_PATH);
  if (accessToken !== undefined) pending.set('Authorization', `Bearer ${accessToken}`);
  return pending.send(body);
}

async function readDays(accountId: string) {
  return database.db.select().from(attendanceDays).where(eq(attendanceDays.accountId, accountId));
}

async function readRequests(accountId: string) {
  return database.db
    .select()
    .from(overtimeRequests)
    .where(eq(overtimeRequests.requestedByAccountId, accountId));
}

async function readDayStatusCodes(accountId: string, businessDate: string) {
  const [day] = await database.db
    .select()
    .from(attendanceDays)
    .where(eq(attendanceDays.accountId, accountId));
  const dayRow = requireRow(day);
  const [status] = await database.db
    .select({ code: masterAttendanceStatuses.code })
    .from(masterAttendanceStatuses)
    .where(eq(masterAttendanceStatuses.id, dayRow.dayStatusId));
  return { businessDate, isWorkingDay: dayRow.isWorkingDay, dayStatusCode: status?.code };
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

describe('overtime request submission', () => {
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
    // 2026-11-02 10:00 WIB, so the working date is today and no time is in the future for the cases below.
    mutableClock.current = new Date('2026-11-02T03:00:00Z');
  });

  it(
    'should save a pending request and create the day when an employee submits a working-day overtime',
    async () => {
      const accountId = randomUUID();
      mutableClock.current = new Date('2026-11-02T14:00:00Z');

      const response = await postOvertime(tokenFor(accountId), overtimeBody()).expect(201);

      expect(overtimeRequestSchema.parse(response.body)).toMatchObject({
        businessDate: WORKING_DATE,
        startAt: '2026-11-02T11:00:00.000Z',
        endAt: '2026-11-02T13:00:00.000Z',
        reason: 'Release deployment',
        status: 'PENDING',
      });
      const [saved] = await readRequests(accountId);
      expect(saved).toMatchObject({ requestedByAccountId: accountId, status: 'PENDING' });
      expect(await readDays(accountId)).toHaveLength(1);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should accept HR as a requester the same way as an employee',
    async () => {
      const accountId = randomUUID();
      mutableClock.current = new Date('2026-11-02T14:00:00Z');

      await postOvertime(tokenFor(accountId, Role.HR), overtimeBody()).expect(201);

      expect(await readRequests(accountId)).toHaveLength(1);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 and write nothing when the request has no gateway token',
    async () => {
      const accountId = randomUUID();

      await postOvertime(undefined, overtimeBody()).expect(401);

      expect(await readRequests(accountId)).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 400 and write nothing when the body names the requester',
    async () => {
      const accountId = randomUUID();
      mutableClock.current = new Date('2026-11-02T14:00:00Z');

      const response = await postOvertime(
        tokenFor(accountId),
        overtimeBody({ requestedByAccountId: randomUUID() }),
      ).expect(400);

      expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
      expect(await readDays(accountId)).toEqual([]);
      expect(await readRequests(accountId)).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 400 BUSINESS_DATE_OUTSIDE_WINDOW and write nothing when the date is 8 days back',
    async () => {
      const accountId = randomUUID();
      // 2026-11-02 is 8 days before 2026-11-10 (WIB).
      mutableClock.current = new Date('2026-11-10T03:00:00Z');

      const response = await postOvertime(tokenFor(accountId), overtimeBody()).expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        code: 'OVERTIME_BUSINESS_DATE_OUTSIDE_WINDOW',
      });
      expect(await readDays(accountId)).toEqual([]);
      expect(await readRequests(accountId)).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should accept a date 7 days back, the last date inside the window',
    async () => {
      const accountId = randomUUID();
      mutableClock.current = new Date('2026-11-10T03:00:00Z');

      await postOvertime(
        tokenFor(accountId),
        overtimeBody({
          businessDate: NEXT_WORKING_DATE,
          startAt: '2026-11-03T18:00:00+07:00',
          endAt: '2026-11-03T19:00:00+07:00',
        }),
      ).expect(201);

      expect(await readRequests(accountId)).toHaveLength(1);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 400 START_BEFORE_SCHEDULED_END when a working-day overtime starts at 17:30 before the 18:00 end',
    async () => {
      const accountId = randomUUID();
      mutableClock.current = new Date('2026-11-02T10:00:00Z');

      const response = await postOvertime(
        tokenFor(accountId),
        overtimeBody({
          startAt: '2026-11-02T17:30:00+07:00',
          endAt: '2026-11-02T18:00:00+07:00',
        }),
      ).expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        code: 'OVERTIME_START_BEFORE_SCHEDULED_END',
      });
      expect(await readRequests(accountId)).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 400 START_NOT_ON_BUSINESS_DATE when the start falls on another date',
    async () => {
      const accountId = randomUUID();
      mutableClock.current = new Date('2026-11-02T14:00:00Z');

      const response = await postOvertime(
        tokenFor(accountId),
        overtimeBody({
          startAt: '2026-11-01T18:00:00+07:00',
          endAt: '2026-11-01T20:00:00+07:00',
        }),
      ).expect(400);

      expect(response.body).toMatchObject({
        code: 'OVERTIME_START_NOT_ON_BUSINESS_DATE',
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 400 END_NOT_AFTER_START when the end is not after the start',
    async () => {
      const accountId = randomUUID();
      mutableClock.current = new Date('2026-11-02T14:00:00Z');

      const response = await postOvertime(
        tokenFor(accountId),
        overtimeBody({
          startAt: '2026-11-02T20:00:00+07:00',
          endAt: '2026-11-02T20:00:00+07:00',
        }),
      ).expect(400);

      expect(response.body).toMatchObject({ code: 'OVERTIME_END_NOT_AFTER_START' });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 400 DAILY_CAP_EXCEEDED on the third 2-hour request for the same date',
    async () => {
      const accountId = randomUUID();
      const accessToken = tokenFor(accountId);
      mutableClock.current = new Date('2026-11-02T14:00:00Z');
      await postOvertime(accessToken, overtimeBody()).expect(201);
      await postOvertime(
        accessToken,
        overtimeBody({
          startAt: '2026-11-02T20:00:00+07:00',
          endAt: '2026-11-02T22:00:00+07:00',
        }),
      ).expect(201);

      const response = await postOvertime(
        accessToken,
        overtimeBody({
          startAt: '2026-11-02T22:00:00+07:00',
          endAt: '2026-11-03T00:00:00+07:00',
        }),
      ).expect(400);

      expect(response.body).toMatchObject({ code: 'OVERTIME_DAILY_CAP_EXCEEDED' });
      expect(await readRequests(accountId)).toHaveLength(2);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return the same request with 200 and store one row when an identical retry reuses the key',
    async () => {
      const accountId = randomUUID();
      const accessToken = tokenFor(accountId);
      mutableClock.current = new Date('2026-11-02T14:00:00Z');
      const body = overtimeBody();
      const first = await postOvertime(accessToken, body).expect(201);

      const retry = await postOvertime(accessToken, body).expect(200);

      expect(retry.body).toEqual(first.body);
      expect(await readRequests(accountId)).toHaveLength(1);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 409 IDEMPOTENCY_KEY_CONFLICT and keep the stored request when the key is reused with other content',
    async () => {
      const accountId = randomUUID();
      const accessToken = tokenFor(accountId);
      mutableClock.current = new Date('2026-11-02T14:00:00Z');
      const body = overtimeBody();
      await postOvertime(accessToken, body).expect(201);

      const response = await postOvertime(accessToken, {
        ...body,
        endAt: '2026-11-02T21:00:00+07:00',
      }).expect(409);

      expect(response.body).toMatchObject({ statusCode: 409, code: 'IDEMPOTENCY_KEY_CONFLICT' });
      const [stored] = await readRequests(accountId);
      expect(stored?.requestedEndAt.toISOString()).toBe('2026-11-02T13:00:00.000Z');
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 409 OVERTIME_OVERLAP and store nothing when the interval overlaps a pending request',
    async () => {
      const accountId = randomUUID();
      const accessToken = tokenFor(accountId);
      mutableClock.current = new Date('2026-11-02T14:00:00Z');
      await postOvertime(accessToken, overtimeBody()).expect(201);

      const response = await postOvertime(
        accessToken,
        overtimeBody({
          startAt: '2026-11-02T19:00:00+07:00',
          endAt: '2026-11-02T19:30:00+07:00',
        }),
      ).expect(409);

      expect(response.body).toMatchObject({ statusCode: 409, code: 'OVERTIME_OVERLAP' });
      expect(await readRequests(accountId)).toHaveLength(1);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should count only the first request when three concurrent 2-hour requests for one date are submitted',
    async () => {
      const accountId = randomUUID();
      const accessToken = tokenFor(accountId);
      mutableClock.current = new Date('2026-11-02T14:00:00Z');
      const intervals = [
        ['2026-11-02T18:00:00+07:00', '2026-11-02T20:00:00+07:00'],
        ['2026-11-02T20:00:00+07:00', '2026-11-02T22:00:00+07:00'],
        ['2026-11-02T22:00:00+07:00', '2026-11-03T00:00:00+07:00'],
      ];

      const responses = await Promise.all(
        intervals.map(([startAt, endAt]) =>
          postOvertime(accessToken, overtimeBody({ startAt, endAt })),
        ),
      );

      const statuses = responses.map((response) => response.status).sort();
      expect(statuses).toEqual([201, 201, 400]);
      const refused = responses.find((response) => response.status === 400);
      expect(refused?.body).toMatchObject({ code: 'OVERTIME_DAILY_CAP_EXCEEDED' });
      expect(await readRequests(accountId)).toHaveLength(2);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should store one request and answer 201 once when identical retries are sent concurrently',
    async () => {
      const accountId = randomUUID();
      const accessToken = tokenFor(accountId);
      mutableClock.current = new Date('2026-11-02T14:00:00Z');
      const body = overtimeBody();

      const responses = await Promise.all(
        Array.from({ length: 3 }, () => postOvertime(accessToken, body)),
      );

      expect(responses.map((response) => response.status).sort()).toEqual([200, 200, 201]);
      expect(new Set(responses.map((response) => response.body.id)).size).toBe(1);
      expect(await readRequests(accountId)).toHaveLength(1);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should store one request and refuse the other when one key is sent concurrently for two dates',
    async () => {
      const accountId = randomUUID();
      const accessToken = tokenFor(accountId);
      const idempotencyKey = randomUUID();
      mutableClock.current = new Date('2026-11-07T05:00:00Z');

      const responses = await Promise.all([
        postOvertime(accessToken, overtimeBody({ idempotencyKey })),
        postOvertime(
          accessToken,
          overtimeBody({
            idempotencyKey,
            businessDate: SATURDAY,
            startAt: '2026-11-07T10:00:00+07:00',
            endAt: '2026-11-07T11:00:00+07:00',
          }),
        ),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
      const refused = responses.find((response) => response.status === 409);
      expect(refused?.body).toMatchObject({ code: 'IDEMPOTENCY_KEY_CONFLICT' });
      expect(await readRequests(accountId)).toHaveLength(1);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should create a day-off day with no scheduled times when the request is for a Saturday',
    async () => {
      const accountId = randomUUID();
      mutableClock.current = new Date('2026-11-07T05:00:00Z');

      await postOvertime(
        tokenFor(accountId),
        overtimeBody({
          businessDate: SATURDAY,
          startAt: '2026-11-07T10:00:00+07:00',
          endAt: '2026-11-07T12:00:00+07:00',
        }),
      ).expect(201);

      expect(await readDayStatusCodes(accountId, SATURDAY)).toEqual({
        businessDate: SATURDAY,
        isWorkingDay: false,
        dayStatusCode: 'DAY_OFF',
      });
    },
    TEST_TIMEOUT_MS,
  );
});
