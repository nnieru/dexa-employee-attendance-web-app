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
import {
  Role,
  workScheduleOverviewSchema,
  workScheduleVersionSchema,
  type AccountStatus,
} from '@dexa/contracts';
import type { Database } from '@dexa/db';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { asc, isNull } from 'drizzle-orm';
import request from 'supertest';
import { createAppModule } from '../src/app.module.js';
import { AttendanceServiceConfigSchema } from '../src/config/attendance-service-config.schema.js';
import { DATABASE } from '../src/infrastructure/db/database.token.js';
import { attendanceDays, workSchedules } from '../src/infrastructure/db/schema.js';
import { USER_JWT_AUDIENCE, USER_JWT_ISSUER, type AuthKeySet } from './auth-key-set.js';
import {
  attendanceServiceAuthKeys,
  attendanceServiceEnvironment,
} from './attendance-service-environment.js';
import { CONTAINER_TIMEOUT_MS, TEST_TIMEOUT_MS, createEmptyDatabaseUri } from './test-database.js';

const WORK_SCHEDULES_PATH = '/api/v1/work-schedules';
const CLOCK_IN_PATH = '/api/v1/attendance/clock-in';
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

function postClockIn(app: INestApplication, accessToken: string) {
  return request(app.getHttpServer())
    .post(CLOCK_IN_PATH)
    .set('Authorization', `Bearer ${accessToken}`);
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

  describe('changing the schedule', () => {
    // Every scenario starts from a database with only the seeded default version, so each one stands alone.
    const NEW_VERSION_REQUEST = {
      workingWeekdays: [1, 3, 5],
      startTime: '08:30',
      endTime: '17:30',
      lateCheckinGraceMinutes: 10,
      earlyCheckoutGraceMinutes: 5,
      lateCheckoutGraceMinutes: 20,
      effectiveFrom: UPCOMING_EFFECTIVE_FROM,
    };
    const EDITED_EFFECTIVE_FROM = '2026-11-20';

    function postWorkSchedule(
      app: INestApplication,
      accessToken: string | undefined,
      body: object,
    ) {
      const pending = request(app.getHttpServer()).post(WORK_SCHEDULES_PATH);
      if (accessToken !== undefined) pending.set('Authorization', `Bearer ${accessToken}`);
      return pending.send(body);
    }

    function putWorkSchedule(
      app: INestApplication,
      versionId: string,
      accessToken: string | undefined,
      body: object,
    ) {
      const pending = request(app.getHttpServer()).put(`${WORK_SCHEDULES_PATH}/${versionId}`);
      if (accessToken !== undefined) pending.set('Authorization', `Bearer ${accessToken}`);
      return pending.send(body);
    }

    async function readVersionRows(database: Database) {
      return database.db.select().from(workSchedules).orderBy(asc(workSchedules.effectiveFrom));
    }

    async function startFreshApp(): Promise<{ app: INestApplication; database: Database }> {
      mutableClock.current = FIRST_START_INSTANT;
      const databaseUrl = await createEmptyDatabaseUri(container.getConnectionUri());
      return startApp(databaseUrl);
    }

    describe('when only the default version exists', () => {
      let app: INestApplication;
      let database: Database;

      beforeAll(async () => {
        ({ app, database } = await startFreshApp());
      }, CONTAINER_TIMEOUT_MS);

      afterAll(async () => {
        await app?.close();
      }, CONTAINER_TIMEOUT_MS);

      it(
        'should refuse a create with 400 when the request carries effectiveUntil',
        async () => {
          const before = await readVersionRows(database);

          const response = await postWorkSchedule(app, tokenFor(hrAccountId, Role.HR), {
            ...NEW_VERSION_REQUEST,
            effectiveUntil: '2026-12-01',
          }).expect(400);

          expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
          expect(await readVersionRows(database)).toEqual(before);
        },
        TEST_TIMEOUT_MS,
      );

      it(
        'should refuse a create with 400 when the effective date is today',
        async () => {
          const before = await readVersionRows(database);

          const response = await postWorkSchedule(app, tokenFor(hrAccountId, Role.HR), {
            ...NEW_VERSION_REQUEST,
            effectiveFrom: DEFAULT_EFFECTIVE_FROM,
          }).expect(400);

          expect(response.body).toMatchObject({
            statusCode: 400,
            code: 'WORK_SCHEDULE_EFFECTIVE_FROM_TOO_EARLY',
          });
          expect(await readVersionRows(database)).toEqual(before);
        },
        TEST_TIMEOUT_MS,
      );

      it(
        'should refuse an edit of the version in effect with 409 and change nothing',
        async () => {
          const [defaultRow] = await readVersionRows(database);
          const before = await readVersionRows(database);

          const response = await putWorkSchedule(
            app,
            defaultRow?.id ?? '',
            tokenFor(hrAccountId, Role.HR),
            NEW_VERSION_REQUEST,
          ).expect(409);

          expect(response.body).toMatchObject({
            statusCode: 409,
            code: 'WORK_SCHEDULE_NOT_UPCOMING',
          });
          expect(await readVersionRows(database)).toEqual(before);
        },
        TEST_TIMEOUT_MS,
      );

      it(
        'should return 404 when the edited version id is unknown',
        async () => {
          const response = await putWorkSchedule(
            app,
            '9f1e2d3c-4b5a-4687-8978-6a5b4c3d2e1f',
            tokenFor(hrAccountId, Role.HR),
            NEW_VERSION_REQUEST,
          ).expect(404);

          expect(response.body).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
        },
        TEST_TIMEOUT_MS,
      );

      it(
        'should refuse a create with 403 when an employee asks',
        async () => {
          await postWorkSchedule(
            app,
            tokenFor(employeeAccountId, Role.EMPLOYEE),
            NEW_VERSION_REQUEST,
          ).expect(403);
        },
        TEST_TIMEOUT_MS,
      );

      it(
        'should refuse an edit with 403 when an employee asks',
        async () => {
          const [defaultRow] = await readVersionRows(database);

          await putWorkSchedule(
            app,
            defaultRow?.id ?? '',
            tokenFor(employeeAccountId, Role.EMPLOYEE),
            NEW_VERSION_REQUEST,
          ).expect(403);
        },
        TEST_TIMEOUT_MS,
      );
    });

    describe('when HR creates the next version', () => {
      let app: INestApplication;
      let database: Database;

      beforeAll(async () => {
        ({ app, database } = await startFreshApp());
      }, CONTAINER_TIMEOUT_MS);

      afterAll(async () => {
        await app?.close();
      }, CONTAINER_TIMEOUT_MS);

      it(
        'should return 201 with the open-ended version and end the version in effect on its effective date',
        async () => {
          const response = await postWorkSchedule(
            app,
            tokenFor(hrAccountId, Role.HR),
            NEW_VERSION_REQUEST,
          ).expect(201);

          expect(workScheduleVersionSchema.parse(response.body)).toEqual({
            id: expect.any(String),
            ...DEFAULT_SCHEDULE_FIELDS,
            ...NEW_VERSION_REQUEST,
            name: DEFAULT_SCHEDULE_FIELDS.name,
            timezone: 'Asia/Jakarta',
            effectiveUntil: null,
          });
          const rows = await readVersionRows(database);
          expect(rows).toHaveLength(2);
          expect(rows[0]).toMatchObject({
            name: DEFAULT_SCHEDULE_FIELDS.name,
            effectiveFrom: DEFAULT_EFFECTIVE_FROM,
            effectiveUntil: UPCOMING_EFFECTIVE_FROM,
          });
          expect(rows[1]).toMatchObject({
            effectiveFrom: UPCOMING_EFFECTIVE_FROM,
            effectiveUntil: null,
          });
        },
        TEST_TIMEOUT_MS,
      );

      it(
        'should refuse a second create with 409 WORK_SCHEDULE_UPCOMING_EXISTS and change nothing',
        async () => {
          const before = await readVersionRows(database);

          const response = await postWorkSchedule(app, tokenFor(hrAccountId, Role.HR), {
            ...NEW_VERSION_REQUEST,
            effectiveFrom: '2026-11-30',
          }).expect(409);

          expect(response.body).toMatchObject({
            statusCode: 409,
            code: 'WORK_SCHEDULE_UPCOMING_EXISTS',
          });
          expect(await readVersionRows(database)).toEqual(before);
        },
        TEST_TIMEOUT_MS,
      );
    });

    describe('when two creates race for the same effective date', () => {
      let app: INestApplication;
      let database: Database;

      beforeAll(async () => {
        ({ app, database } = await startFreshApp());
      }, CONTAINER_TIMEOUT_MS);

      afterAll(async () => {
        await app?.close();
      }, CONTAINER_TIMEOUT_MS);

      it(
        'should save one version and answer 409 to the other create',
        async () => {
          const accessToken = tokenFor(hrAccountId, Role.HR);

          const responses = await Promise.all([
            postWorkSchedule(app, accessToken, NEW_VERSION_REQUEST),
            postWorkSchedule(app, accessToken, NEW_VERSION_REQUEST),
          ]);

          expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
          const conflict = responses.find((response) => response.status === 409);
          expect(conflict?.body).toMatchObject({ statusCode: 409 });
          const rows = await readVersionRows(database);
          expect(rows).toHaveLength(2);
          expect(rows[1]).toMatchObject({ effectiveUntil: null });
        },
        TEST_TIMEOUT_MS,
      );
    });

    describe('when an upcoming version exists', () => {
      let app: INestApplication;
      let database: Database;

      beforeAll(async () => {
        ({ app, database } = await startFreshApp());
        await scheduleUpcomingVersion(database);
      }, CONTAINER_TIMEOUT_MS);

      afterAll(async () => {
        await app?.close();
      }, CONTAINER_TIMEOUT_MS);

      it(
        'should refuse an edit that moves the upcoming version to today with 400 and change nothing',
        async () => {
          const [, upcomingRow] = await readVersionRows(database);
          const before = await readVersionRows(database);

          const response = await putWorkSchedule(
            app,
            upcomingRow?.id ?? '',
            tokenFor(hrAccountId, Role.HR),
            { ...NEW_VERSION_REQUEST, effectiveFrom: DEFAULT_EFFECTIVE_FROM },
          ).expect(400);

          expect(response.body).toMatchObject({
            statusCode: 400,
            code: 'WORK_SCHEDULE_EFFECTIVE_FROM_TOO_EARLY',
          });
          expect(await readVersionRows(database)).toEqual(before);
        },
        TEST_TIMEOUT_MS,
      );

      it(
        'should edit the upcoming version and move the previous version end with its effective date',
        async () => {
          const [, upcomingRow] = await readVersionRows(database);

          const response = await putWorkSchedule(
            app,
            upcomingRow?.id ?? '',
            tokenFor(hrAccountId, Role.HR),
            { ...NEW_VERSION_REQUEST, effectiveFrom: EDITED_EFFECTIVE_FROM },
          ).expect(200);

          expect(workScheduleVersionSchema.parse(response.body)).toEqual({
            id: upcomingRow?.id,
            ...UPCOMING_SCHEDULE,
            ...NEW_VERSION_REQUEST,
            effectiveFrom: EDITED_EFFECTIVE_FROM,
            effectiveUntil: null,
          });
          const rows = await readVersionRows(database);
          expect(rows[0]).toMatchObject({
            effectiveFrom: DEFAULT_EFFECTIVE_FROM,
            effectiveUntil: EDITED_EFFECTIVE_FROM,
          });
          expect(rows[1]).toMatchObject({
            effectiveFrom: EDITED_EFFECTIVE_FROM,
            effectiveUntil: null,
          });
        },
        TEST_TIMEOUT_MS,
      );

      it(
        'should refuse a second create with 409 WORK_SCHEDULE_UPCOMING_EXISTS when the upcoming version was edited',
        async () => {
          const response = await postWorkSchedule(app, tokenFor(hrAccountId, Role.HR), {
            ...NEW_VERSION_REQUEST,
            effectiveFrom: '2026-11-30',
          }).expect(409);

          expect(response.body).toMatchObject({
            statusCode: 409,
            code: 'WORK_SCHEDULE_UPCOMING_EXISTS',
          });
        },
        TEST_TIMEOUT_MS,
      );
    });

    describe('when HR moves the upcoming version to an earlier date', () => {
      let app: INestApplication;
      let database: Database;

      beforeAll(async () => {
        ({ app, database } = await startFreshApp());
        await scheduleUpcomingVersion(database);
      }, CONTAINER_TIMEOUT_MS);

      afterAll(async () => {
        await app?.close();
      }, CONTAINER_TIMEOUT_MS);

      it(
        'should move the previous version end and the upcoming start together without an overlap',
        async () => {
          const [, upcomingRow] = await readVersionRows(database);

          await putWorkSchedule(app, upcomingRow?.id ?? '', tokenFor(hrAccountId, Role.HR), {
            ...NEW_VERSION_REQUEST,
            effectiveFrom: '2026-11-10',
          }).expect(200);

          const rows = await readVersionRows(database);
          expect(rows[0]).toMatchObject({
            effectiveFrom: DEFAULT_EFFECTIVE_FROM,
            effectiveUntil: '2026-11-10',
          });
          expect(rows[1]).toMatchObject({ effectiveFrom: '2026-11-10', effectiveUntil: null });
        },
        TEST_TIMEOUT_MS,
      );
    });

    describe('when a version is created and punches are recorded around its effective date', () => {
      let app: INestApplication;
      let database: Database;

      beforeAll(async () => {
        ({ app, database } = await startFreshApp());
      }, CONTAINER_TIMEOUT_MS);

      afterAll(async () => {
        await app?.close();
      }, CONTAINER_TIMEOUT_MS);

      it(
        'should classify each punch with the version in effect on its business date',
        async () => {
          const accessToken = tokenFor(employeeAccountId, Role.EMPLOYEE);
          // Effective tomorrow (3 Nov WIB). Under the new version 08:45 is late (on time through 08:40), while the default
          // version starts at 09:00, so 08:45 is early there.
          await postWorkSchedule(app, tokenFor(hrAccountId, Role.HR), {
            ...NEW_VERSION_REQUEST,
            workingWeekdays: [1, 2, 3, 4, 5],
            effectiveFrom: '2026-11-03',
          }).expect(201);

          // 09:10 WIB on 2 Nov is on time under the default (09:00 with 15 minutes of grace).
          mutableClock.current = new Date('2026-11-02T02:10:00Z');
          const dayBefore = await postClockIn(app, accessToken).expect(201);
          // 08:45 WIB on 3 Nov, the effective date of the new version.
          mutableClock.current = new Date('2026-11-03T01:45:00Z');
          const effectiveDate = await postClockIn(app, accessToken).expect(201);

          expect(dayBefore.body).toMatchObject({
            businessDate: '2026-11-02',
            classification: 'ON_TIME_CHECKIN',
          });
          expect(effectiveDate.body).toMatchObject({
            businessDate: '2026-11-03',
            classification: 'LATE_CHECKIN',
          });
          const days = await database.db
            .select({
              businessDate: attendanceDays.businessDate,
              workScheduleId: attendanceDays.workScheduleId,
            })
            .from(attendanceDays)
            .orderBy(asc(attendanceDays.businessDate));
          const rows = await readVersionRows(database);
          expect(days.map((day) => day.workScheduleId)).toEqual([rows[0]?.id, rows[1]?.id]);
        },
        TEST_TIMEOUT_MS,
      );
    });
  });
});
