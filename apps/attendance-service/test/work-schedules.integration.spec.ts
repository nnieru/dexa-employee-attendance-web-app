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
import { Role, workScheduleOverviewSchema, type AccountStatus } from '@dexa/contracts';
import type { Database } from '@dexa/db';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { isNull } from 'drizzle-orm';
import request from 'supertest';
import { createAppModule } from '../src/app.module.js';
import { AttendanceServiceConfigSchema } from '../src/config/attendance-service-config.schema.js';
import { DATABASE } from '../src/infrastructure/db/database.token.js';
import { workSchedules } from '../src/infrastructure/db/schema.js';
import { USER_JWT_AUDIENCE, USER_JWT_ISSUER, type AuthKeySet } from './auth-key-set.js';
import {
  attendanceServiceAuthKeys,
  attendanceServiceEnvironment,
} from './attendance-service-environment.js';
import { CONTAINER_TIMEOUT_MS, TEST_TIMEOUT_MS, createEmptyDatabaseUri } from './test-database.js';

const WORK_SCHEDULES_PATH = '/api/v1/work-schedules';
const TOKEN_LIFETIME_SECONDS = 300;
// The default schedule is seeded from the first start, so it takes effect on this Monday (WIB).
const FIRST_START_INSTANT = new Date('2026-11-02T01:00:00Z');
const DEFAULT_EFFECTIVE_FROM = '2026-11-02';
// The upcoming version takes effect on this Monday. 00:00 WIB on that day is 17:00Z the day before.
const UPCOMING_EFFECTIVE_FROM = '2026-11-16';
const UPCOMING_BUSINESS_DAY_START_INSTANT = new Date('2026-11-15T17:00:00Z');
const UPCOMING_SCHEDULE = {
  name: 'Shortened company schedule',
  timezone: 'Asia/Jakarta',
  workingWeekdays: [1, 3, 5],
  startTime: '08:30',
  endTime: '17:30',
  lateCheckinGraceMinutes: 10,
  earlyCheckoutGraceMinutes: 5,
  lateCheckoutGraceMinutes: 20,
};

// Stands in for auth-service. The clock is shared across tests, so each test sets the instant it needs.
const accountStatuses = new Map<string, AccountStatus>();
const fakeAccountStatusReader: IAccountStatusReader = {
  findAccountStatus: (accountId) => Promise.resolve(accountStatuses.get(accountId)),
};
const mutableClock: { current: Date } = { current: FIRST_START_INSTANT };
const fixedClock: IClock = { now: () => new Date(mutableClock.current) };

let container: StartedPostgreSqlContainer;
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

function tokenFor(accountId: string, role: Role): string {
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECONDS;
  return signUserToken(accountId, role, expiresAt);
}

function registerAccount(): string {
  const accountId = randomUUID();
  accountStatuses.set(accountId, { isActive: true });
  return accountId;
}

function getWorkSchedules(app: INestApplication, accessToken: string | undefined) {
  const pending = request(app.getHttpServer()).get(WORK_SCHEDULES_PATH);
  if (accessToken !== undefined) pending.set('Authorization', `Bearer ${accessToken}`);
  return pending;
}

async function startApp(
  databaseUrl: string,
): Promise<{ app: INestApplication; database: Database }> {
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
  const app = moduleRef.createNestApplication();
  configureApp(app, { CORS_ORIGINS: [] });
  await app.init();
  return { app, database: moduleRef.get<Database>(DATABASE) };
}

// Ends the version in effect on the upcoming date and inserts the upcoming version in the same transaction, as
// DATABASE §5.2 describes, so the exclusion constraint sees no overlap.
async function scheduleUpcomingVersion(database: Database): Promise<void> {
  await database.db.transaction(async (transaction) => {
    await transaction
      .update(workSchedules)
      .set({ effectiveUntil: UPCOMING_EFFECTIVE_FROM })
      .where(isNull(workSchedules.effectiveUntil));
    await transaction.insert(workSchedules).values({
      ...UPCOMING_SCHEDULE,
      effectiveFrom: UPCOMING_EFFECTIVE_FROM,
      effectiveUntil: null,
    });
  });
}

const DEFAULT_SCHEDULE_FIELDS = {
  name: 'Default company schedule',
  timezone: 'Asia/Jakarta',
  workingWeekdays: [1, 2, 3, 4, 5],
  startTime: '09:00',
  endTime: '18:00',
  lateCheckinGraceMinutes: 15,
  earlyCheckoutGraceMinutes: 0,
  lateCheckoutGraceMinutes: 0,
  effectiveFrom: DEFAULT_EFFECTIVE_FROM,
};

describe('work schedule versions', () => {
  let hrAccountId: string;
  let employeeAccountId: string;

  beforeAll(async () => {
    keys = attendanceServiceAuthKeys();
    container = await new PostgreSqlContainer('postgres:18').start();
    hrAccountId = registerAccount();
    employeeAccountId = registerAccount();
  }, CONTAINER_TIMEOUT_MS);

  afterAll(async () => {
    await container?.stop();
  }, CONTAINER_TIMEOUT_MS);

  beforeEach(() => {
    mutableClock.current = FIRST_START_INSTANT;
  });

  describe('when only the version in effect exists', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const databaseUrl = await createEmptyDatabaseUri(container.getConnectionUri());
      ({ app } = await startApp(databaseUrl));
    }, CONTAINER_TIMEOUT_MS);

    afterAll(async () => {
      await app?.close();
    }, CONTAINER_TIMEOUT_MS);

    it(
      'should return the version in effect and no upcoming version when HR asks',
      async () => {
        const response = await getWorkSchedules(app, tokenFor(hrAccountId, Role.HR)).expect(200);

        const overview = workScheduleOverviewSchema.parse(response.body);
        expect(overview.current).toMatchObject({
          ...DEFAULT_SCHEDULE_FIELDS,
          effectiveUntil: null,
        });
        expect(overview.current?.id).toEqual(expect.any(String));
        expect(overview.upcoming).toBeNull();
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should refuse the schedule with 403 when an employee asks',
      async () => {
        await getWorkSchedules(app, tokenFor(employeeAccountId, Role.EMPLOYEE)).expect(403);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should refuse the schedule with 401 when no token is sent',
      async () => {
        await getWorkSchedules(app, undefined).expect(401);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('when an upcoming version exists', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const databaseUrl = await createEmptyDatabaseUri(container.getConnectionUri());
      const started = await startApp(databaseUrl);
      app = started.app;
      await scheduleUpcomingVersion(started.database);
    }, CONTAINER_TIMEOUT_MS);

    afterAll(async () => {
      await app?.close();
    }, CONTAINER_TIMEOUT_MS);

    it(
      'should return the version in effect until the upcoming date and the upcoming version when HR asks',
      async () => {
        const response = await getWorkSchedules(app, tokenFor(hrAccountId, Role.HR)).expect(200);

        const overview = workScheduleOverviewSchema.parse(response.body);
        expect(overview.current).toMatchObject({
          ...DEFAULT_SCHEDULE_FIELDS,
          effectiveUntil: UPCOMING_EFFECTIVE_FROM,
        });
        expect(overview.upcoming).toMatchObject({
          ...UPCOMING_SCHEDULE,
          effectiveFrom: UPCOMING_EFFECTIVE_FROM,
          effectiveUntil: null,
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return the upcoming version as the version in effect once its date arrives',
      async () => {
        mutableClock.current = UPCOMING_BUSINESS_DAY_START_INSTANT;

        const response = await getWorkSchedules(app, tokenFor(hrAccountId, Role.HR)).expect(200);

        const overview = workScheduleOverviewSchema.parse(response.body);
        expect(overview.current).toMatchObject({
          ...UPCOMING_SCHEDULE,
          effectiveFrom: UPCOMING_EFFECTIVE_FROM,
          effectiveUntil: null,
        });
        expect(overview.upcoming).toBeNull();
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should refuse the schedule with 403 when an employee asks',
      async () => {
        await getWorkSchedules(app, tokenFor(employeeAccountId, Role.EMPLOYEE)).expect(403);
      },
      TEST_TIMEOUT_MS,
    );
  });
});
