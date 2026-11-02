import { randomUUID } from 'node:crypto';
import { CLOCK, configureApp, parseConfig, ServiceName, type IClock } from '@dexa/common';
import { correctionRequestPageSchema, Role, type RequestStatus } from '@dexa/contracts';
import type { Database } from '@dexa/db';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { createAppModule } from '../src/app.module.js';
import { AttendanceServiceConfigSchema } from '../src/config/attendance-service-config.schema.js';
import { DATABASE } from '../src/infrastructure/db/database.token.js';
import { attendanceAdjustmentRequests } from '../src/infrastructure/db/schema.js';
import type { AuthKeySet } from './auth-key-set.js';
import {
  attendanceServiceAuthKeys,
  attendanceServiceEnvironment,
} from './attendance-service-environment.js';
import { signGatewayUserToken } from './gateway-user-token.js';
import { CONTAINER_TIMEOUT_MS, TEST_TIMEOUT_MS, createEmptyDatabaseUri } from './test-database.js';

const SUBMIT_PATH = '/api/v1/attendance-corrections';
const LIST_PATH = '/api/v1/attendance-corrections/me';
const TOKEN_LIFETIME_SECONDS = 60;
// The default schedule is seeded at startup from the clock, so the app starts on the day it takes effect (Monday).
const SCHEDULE_START_MOMENT = new Date('2026-11-02T01:00:00Z');
const MONDAY = '2026-11-02';
const TUESDAY = '2026-11-03';
const WEDNESDAY = '2026-11-04';
const THURSDAY = '2026-11-05';
const FRIDAY = '2026-11-06';
// Friday 10:00 WIB. Every date above is in the past, and inside the 30-day correction window.
const LIST_MOMENT = new Date('2026-11-06T03:00:00Z');
const mutableClock: { current: Date } = { current: SCHEDULE_START_MOMENT };
const fixedClock: IClock = { now: () => new Date(mutableClock.current) };

let container: StartedPostgreSqlContainer;
let app: INestApplication;
let database: Database;
let keys: AuthKeySet;

function tokenFor(accountId: string, role: Role = Role.EMPLOYEE): string {
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECONDS;
  return signGatewayUserToken(keys, ServiceName.ATTENDANCE_SERVICE, accountId, role, expiresAt);
}

// A leave correction for the given date. Leave outcomes carry no times.
function leaveBody(businessDate: string) {
  return {
    requestedDayStatus: 'LEAVE',
    businessDate,
    reason: `Leave on ${businessDate}`,
    idempotencyKey: randomUUID(),
  };
}

async function submitCorrection(accessToken: string, body: object): Promise<string> {
  const response = await request(app.getHttpServer())
    .post(SUBMIT_PATH)
    .set('Authorization', `Bearer ${accessToken}`)
    .send(body)
    .expect(201);
  return response.body.id;
}

// HR decides a request in the database, as the decision endpoint is not built yet (T-REQ-09). The triggers and
// constraint checks still apply: an approved row carries applied_revision, and a rejected row a reason.
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

function listOwn(accessToken: string | undefined, query: Record<string, string> = {}) {
  const pending = request(app.getHttpServer()).get(LIST_PATH).query(query);
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
    .compile();
  const nestApp = moduleRef.createNestApplication();
  configureApp(nestApp, { CORS_ORIGINS: [] });
  await nestApp.init();
  database = moduleRef.get<Database>(DATABASE);
  return nestApp;
}

describe('own correction request list', () => {
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
    mutableClock.current = LIST_MOMENT;
  });

  it(
    'should list only the requester own corrections when another account has corrections',
    async () => {
      const employeeToken = tokenFor(randomUUID());
      const otherToken = tokenFor(randomUUID());
      const ownIds = [
        await submitCorrection(employeeToken, leaveBody(MONDAY)),
        await submitCorrection(employeeToken, leaveBody(TUESDAY)),
      ];
      const otherId = await submitCorrection(otherToken, leaveBody(WEDNESDAY));

      const ownPage = correctionRequestPageSchema.parse(
        (await listOwn(employeeToken).expect(200)).body,
      );
      const otherPage = correctionRequestPageSchema.parse(
        (await listOwn(otherToken).expect(200)).body,
      );

      expect(ownPage.totalItems).toBe(2);
      expect(ownPage.items.map((item) => item.id).sort()).toEqual([...ownIds].sort());
      expect(otherPage.items.map((item) => item.id)).toEqual([otherId]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should list the newest correction first',
    async () => {
      const accessToken = tokenFor(randomUUID());
      for (const businessDate of [MONDAY, TUESDAY, WEDNESDAY]) {
        await submitCorrection(accessToken, leaveBody(businessDate));
      }

      const page = correctionRequestPageSchema.parse((await listOwn(accessToken).expect(200)).body);

      expect(page.items.map((item) => item.businessDate)).toEqual([WEDNESDAY, TUESDAY, MONDAY]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return the requested times, reason, reviewer reason, and decision time of a rejected correction',
    async () => {
      const accessToken = tokenFor(randomUUID());
      const requestId = await submitCorrection(accessToken, {
        requestedDayStatus: 'PRESENT',
        businessDate: MONDAY,
        clockInAt: '2026-11-02T09:00:00+07:00',
        clockOutAt: '2026-11-02T17:00:00+07:00',
        reason: 'Forgot to clock in',
        idempotencyKey: randomUUID(),
      });
      await decideCorrection(requestId, 'REJECTED', 'Punch log shows otherwise');

      const response = await listOwn(accessToken).expect(200);

      const page = correctionRequestPageSchema.parse(response.body);
      expect(page.items).toEqual([
        {
          id: requestId,
          businessDate: MONDAY,
          requestedDayStatus: 'PRESENT',
          clockInAt: '2026-11-02T02:00:00.000Z',
          clockOutAt: '2026-11-02T10:00:00.000Z',
          reason: 'Forgot to clock in',
          status: 'REJECTED',
          reviewReason: 'Punch log shows otherwise',
          reviewedAt: expect.any(String),
          createdAt: expect.any(String),
        },
      ]);
      // The reviewer and the requester are internal references and never part of the response.
      expect(Object.keys(response.body.items[0]).sort()).toEqual([
        'businessDate',
        'clockInAt',
        'clockOutAt',
        'createdAt',
        'id',
        'reason',
        'requestedDayStatus',
        'reviewReason',
        'reviewedAt',
        'status',
      ]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return a pending correction with null times for a leave, and a null reviewer reason and decision time',
    async () => {
      const accessToken = tokenFor(randomUUID());
      await submitCorrection(accessToken, leaveBody(MONDAY));

      const page = correctionRequestPageSchema.parse((await listOwn(accessToken).expect(200)).body);

      expect(page.items[0]).toMatchObject({
        requestedDayStatus: 'LEAVE',
        clockInAt: null,
        clockOutAt: null,
        status: 'PENDING',
        reviewReason: null,
        reviewedAt: null,
      });
    },
    TEST_TIMEOUT_MS,
  );

  it.each<{ readonly status: RequestStatus; readonly expectedDates: readonly string[] }>([
    { status: 'APPROVED', expectedDates: [FRIDAY, MONDAY] },
    { status: 'REJECTED', expectedDates: [THURSDAY, TUESDAY] },
    { status: 'PENDING', expectedDates: [WEDNESDAY] },
  ])(
    'should list only the $status corrections when the status filter is $status',
    async ({ status, expectedDates }) => {
      const accessToken = tokenFor(randomUUID());
      const mondayId = await submitCorrection(accessToken, leaveBody(MONDAY));
      const tuesdayId = await submitCorrection(accessToken, leaveBody(TUESDAY));
      await submitCorrection(accessToken, leaveBody(WEDNESDAY));
      const thursdayId = await submitCorrection(accessToken, leaveBody(THURSDAY));
      const fridayId = await submitCorrection(accessToken, leaveBody(FRIDAY));
      await decideCorrection(mondayId, 'APPROVED', null);
      await decideCorrection(tuesdayId, 'REJECTED', 'Already recorded as leave');
      await decideCorrection(thursdayId, 'REJECTED', 'Attach the note first');
      await decideCorrection(fridayId, 'APPROVED', null);

      const page = correctionRequestPageSchema.parse(
        (await listOwn(accessToken, { status }).expect(200)).body,
      );

      expect(page.items.map((item) => item.businessDate)).toEqual(expectedDates);
      expect(page.items.every((item) => item.status === status)).toBe(true);
      expect(page.totalItems).toBe(expectedDates.length);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should page the list newest first and report the total when the page size is 2',
    async () => {
      const accessToken = tokenFor(randomUUID());
      for (const businessDate of [MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY]) {
        await submitCorrection(accessToken, leaveBody(businessDate));
      }
      const reversedDates = [FRIDAY, THURSDAY, WEDNESDAY, TUESDAY, MONDAY];

      const firstPage = correctionRequestPageSchema.parse(
        (await listOwn(accessToken, { pageSize: '2' }).expect(200)).body,
      );
      const secondPage = correctionRequestPageSchema.parse(
        (await listOwn(accessToken, { pageSize: '2', page: '2' }).expect(200)).body,
      );
      const lastPage = correctionRequestPageSchema.parse(
        (await listOwn(accessToken, { pageSize: '2', page: '3' }).expect(200)).body,
      );
      const beyondLastPage = correctionRequestPageSchema.parse(
        (await listOwn(accessToken, { pageSize: '2', page: '4' }).expect(200)).body,
      );

      expect(firstPage).toMatchObject({ page: 1, pageSize: 2, totalItems: 5, totalPages: 3 });
      expect(firstPage.items.map((item) => item.businessDate)).toEqual(reversedDates.slice(0, 2));
      expect(secondPage.items.map((item) => item.businessDate)).toEqual(reversedDates.slice(2, 4));
      expect(lastPage.items.map((item) => item.businessDate)).toEqual(reversedDates.slice(4));
      expect(beyondLastPage).toMatchObject({ page: 4, totalItems: 5, totalPages: 3 });
      expect(beyondLastPage.items).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return an empty page with a zero total when the account has no corrections',
    async () => {
      const response = await listOwn(tokenFor(randomUUID())).expect(200);

      expect(correctionRequestPageSchema.parse(response.body)).toEqual({
        items: [],
        page: 1,
        pageSize: 20,
        totalItems: 0,
        totalPages: 0,
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should list the own corrections of an HR account the same way',
    async () => {
      const accessToken = tokenFor(randomUUID(), Role.HR);
      await submitCorrection(accessToken, leaveBody(MONDAY));

      const page = correctionRequestPageSchema.parse((await listOwn(accessToken).expect(200)).body);

      expect(page.totalItems).toBe(1);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 when the request has no gateway token',
    async () => {
      await listOwn(undefined).expect(401);
    },
    TEST_TIMEOUT_MS,
  );

  it.each<{ readonly condition: string; readonly query: Record<string, string> }>([
    { condition: 'the status is not a request status', query: { status: 'CANCELLED' } },
    { condition: 'the status is empty', query: { status: '' } },
    { condition: 'the page is 0', query: { page: '0' } },
    { condition: 'the page size is above the maximum', query: { pageSize: '101' } },
    { condition: 'the page size is not a number', query: { pageSize: 'many' } },
    { condition: 'the account is named in the query', query: { accountId: randomUUID() } },
    { condition: 'an unknown parameter is present', query: { sort: 'createdAt' } },
  ])(
    'should return 400 when $condition',
    async ({ query }) => {
      const response = await listOwn(tokenFor(randomUUID()), query).expect(400);

      expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
    },
    TEST_TIMEOUT_MS,
  );
});
