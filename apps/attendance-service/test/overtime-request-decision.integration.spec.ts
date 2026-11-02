import { randomUUID } from 'node:crypto';
import { CLOCK, configureApp, parseConfig, ServiceName, type IClock } from '@dexa/common';
import { ErrorCode, Role, type OvertimeRequest } from '@dexa/contracts';
import type { Database } from '@dexa/db';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { createAppModule } from '../src/app.module.js';
import { AttendanceServiceConfigSchema } from '../src/config/attendance-service-config.schema.js';
import {
  EMPLOYEE_CLIENT,
  type IEmployeeClient,
} from '../src/employees/employee-client.interface.js';
import { DATABASE } from '../src/infrastructure/db/database.token.js';
import { overtimeRequests } from '../src/infrastructure/db/schema.js';
import type { AuthKeySet } from './auth-key-set.js';
import {
  attendanceServiceAuthKeys,
  attendanceServiceEnvironment,
} from './attendance-service-environment.js';
import { signGatewayUserToken } from './gateway-user-token.js';
import { CONTAINER_TIMEOUT_MS, TEST_TIMEOUT_MS, createEmptyDatabaseUri } from './test-database.js';

const TOKEN_LIFETIME_SECONDS = 60;
const OVERTIME_PATH = '/api/v1/overtime-requests';
// Friday 10:00 WIB. Monday 2026-11-02 is inside the 7-day window and is a scheduled working day (default schedule).
const SUBMIT_MOMENT = new Date('2026-11-06T03:00:00Z');
// The database requires reviewed_at >= created_at, and created_at is the real insert time. The decision moments are
// therefore set after the suite starts, so the check holds whatever the wall clock reads when the suite runs.
const ONE_HOUR_MS = 60 * 60 * 1000;
const DECISION_MOMENT = new Date(Date.now() + ONE_HOUR_MS);
const LATER_DECISION_MOMENT = new Date(Date.now() + 2 * ONE_HOUR_MS);
const MONDAY = '2026-11-02';
// The default schedule takes effect on the business date the clock reads at startup, so the clock starts on Monday
// 2026-11-02 (WIB), and each submission moves it to the Friday above.
const SCHEDULE_START_MOMENT = new Date('2026-11-02T01:00:00Z');
const mutableClock: { current: Date } = { current: SCHEDULE_START_MOMENT };
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

// Each test uses its own requester, so one test's pending overtime never overlaps another's.
async function submitOvertime(accountId: string, role: Role = Role.EMPLOYEE): Promise<string> {
  mutableClock.current = SUBMIT_MOMENT;
  const response = await request(app.getHttpServer())
    .post(OVERTIME_PATH)
    .set('Authorization', `Bearer ${tokenFor(accountId, role)}`)
    .send({
      businessDate: MONDAY,
      startAt: `${MONDAY}T18:00:00+07:00`,
      endAt: `${MONDAY}T19:00:00+07:00`,
      reason: 'Release work',
      idempotencyKey: randomUUID(),
    })
    .expect(201);
  return response.body.id;
}

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
    .post(`${OVERTIME_PATH}/${requestId}/${action}`)
    .set('Authorization', `Bearer ${tokenFor(accountId, role)}`);
  return body === undefined ? pending : pending.send(body);
}

async function readStoredRequest(requestId: string) {
  const [row] = await database.db
    .select()
    .from(overtimeRequests)
    .where(eq(overtimeRequests.id, requestId));
  return row;
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

describe('overtime request decisions', () => {
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
      'should approve a pending request with the reviewer, the decision instant, and no reason',
      async () => {
        const reviewer = randomUUID();
        const requestId = await submitOvertime(randomUUID());

        const response = await decide(requestId, 'approve', reviewer, {}).expect(200);

        expect(response.body).toMatchObject({
          id: requestId,
          status: 'APPROVED',
          reviewReason: null,
          reviewedAt: DECISION_MOMENT.toISOString(),
        });
        const stored = await readStoredRequest(requestId);
        expect(stored).toMatchObject({
          status: 'APPROVED',
          reviewedByAccountId: reviewer,
          reviewReason: null,
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should approve a request that is sent with no body, because the reason is optional',
      async () => {
        const requestId = await submitOvertime(randomUUID());

        const response = await decide(requestId, 'approve', randomUUID(), undefined).expect(200);

        expect(response.body).toMatchObject({ status: 'APPROVED', reviewReason: null });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should store an approval reason trimmed when the HR reviewer gives one',
      async () => {
        const requestId = await submitOvertime(randomUUID());

        const response = await decide(requestId, 'approve', randomUUID(), {
          reviewReason: '  Confirmed with the team lead  ',
        }).expect(200);

        expect(response.body).toMatchObject({
          status: 'APPROVED',
          reviewReason: 'Confirmed with the team lead',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should answer the recorded result and write nothing when the same approval is repeated',
      async () => {
        const firstReviewer = randomUUID();
        const requestId = await submitOvertime(randomUUID());
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
        const stored = await readStoredRequest(requestId);
        expect(stored).toMatchObject({ reviewedByAccountId: firstReviewer });
        expect(stored?.reviewedAt?.toISOString()).toBe(DECISION_MOMENT.toISOString());
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should refuse an approval of a rejected request with 409 and keep the rejection',
      async () => {
        const reviewer = randomUUID();
        const requestId = await submitOvertime(randomUUID());
        await decide(requestId, 'reject', reviewer, { reviewReason: 'Not needed' }).expect(200);

        const response = await decide(requestId, 'approve', randomUUID(), {}).expect(409);

        expect(response.body).toMatchObject({
          statusCode: 409,
          code: ErrorCode.REQUEST_ALREADY_DECIDED,
        });
        expect(await readStoredRequest(requestId)).toMatchObject({
          status: 'REJECTED',
          reviewedByAccountId: reviewer,
          reviewReason: 'Not needed',
        });
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('reject', () => {
    it(
      'should reject a pending request with the reason, the reviewer, and the decision instant',
      async () => {
        const reviewer = randomUUID();
        const requestId = await submitOvertime(randomUUID());

        const response = await decide(requestId, 'reject', reviewer, {
          reviewReason: '  Overlaps the release window  ',
        }).expect(200);

        expect(response.body).toMatchObject({
          status: 'REJECTED',
          reviewReason: 'Overlaps the release window',
          reviewedAt: DECISION_MOMENT.toISOString(),
        });
        expect(await readStoredRequest(requestId)).toMatchObject({
          status: 'REJECTED',
          reviewedByAccountId: reviewer,
          reviewReason: 'Overlaps the release window',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it.each([
      { condition: 'the body has no reason', body: {} },
      { condition: 'the reason is whitespace only', body: { reviewReason: '   ' } },
    ])(
      'should refuse a rejection when $condition and leave the request pending',
      async ({ body }) => {
        const requestId = await submitOvertime(randomUUID());

        const response = await decide(requestId, 'reject', randomUUID(), body).expect(400);

        expect(response.body).toMatchObject({ statusCode: 400 });
        expect(await readStoredRequest(requestId)).toMatchObject({
          status: 'PENDING',
          reviewedByAccountId: null,
          reviewedAt: null,
          reviewReason: null,
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should refuse a whitespace-only rejection with REVIEW_REASON_REQUIRED from the decision rule',
      async () => {
        const requestId = await submitOvertime(randomUUID());

        const response = await decide(requestId, 'reject', randomUUID(), {
          reviewReason: '   ',
        }).expect(400);

        expect(response.body).toMatchObject({ code: ErrorCode.REVIEW_REASON_REQUIRED });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should refuse a rejection of an approved request with 409 and keep the approval',
      async () => {
        const requestId = await submitOvertime(randomUUID());
        await decide(requestId, 'approve', randomUUID(), {}).expect(200);

        const response = await decide(requestId, 'reject', randomUUID(), {
          reviewReason: 'Changed my mind',
        }).expect(409);

        expect(response.body).toMatchObject({ code: ErrorCode.REQUEST_ALREADY_DECIDED });
        expect(await readStoredRequest(requestId)).toMatchObject({ status: 'APPROVED' });
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('reviewer rules', () => {
    it(
      'should refuse HR deciding their own request with 403 and write nothing',
      async () => {
        const hrAccountId = randomUUID();
        const requestId = await submitOvertime(hrAccountId, Role.HR);

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
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 403 and write nothing when an employee token decides a request',
      async () => {
        const requestId = await submitOvertime(randomUUID());
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
        const requestId = await submitOvertime(randomUUID());

        await request(app.getHttpServer())
          .post(`${OVERTIME_PATH}/${requestId}/approve`)
          .send({})
          .expect(401);

        expect(await readStoredRequest(requestId)).toMatchObject({ status: 'PENDING' });
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('request identity', () => {
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
        const requestId = await submitOvertime(randomUUID());

        const [approval, rejection] = await Promise.all([
          decide(requestId, 'approve', approver, {}),
          decide(requestId, 'reject', rejecter, { reviewReason: 'Concurrent' }),
        ]);

        const statuses = [approval.status, rejection.status].sort();
        expect(statuses).toEqual([200, 409]);
        const winner: OvertimeRequest = approval.status === 200 ? approval.body : rejection.body;
        const stored = await readStoredRequest(requestId);
        expect(stored).toMatchObject({
          status: winner.status,
          reviewedByAccountId: winner.status === 'APPROVED' ? approver : rejecter,
          reviewReason: winner.reviewReason,
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should answer both of two concurrent identical approvals with 200 and store one decision',
      async () => {
        const firstReviewer = randomUUID();
        const secondReviewer = randomUUID();
        const requestId = await submitOvertime(randomUUID());

        const responses = await Promise.all([
          decide(requestId, 'approve', firstReviewer, {}),
          decide(requestId, 'approve', secondReviewer, {}),
        ]);

        expect(responses.map((response) => response.status)).toEqual([200, 200]);
        expect(responses[0]?.body).toEqual(responses[1]?.body);
        const stored = await readStoredRequest(requestId);
        expect([firstReviewer, secondReviewer]).toContain(stored?.reviewedByAccountId);
      },
      TEST_TIMEOUT_MS,
    );
  });
});
