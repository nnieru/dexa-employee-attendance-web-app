import { CLOCK, parseConfig, type IClock } from '@dexa/common';
import { createDatabase, runMigrations, type Database } from '@dexa/db';
import { Test, type TestingModule } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { createAppModule } from '../src/app.module.js';
import { AttendanceServiceConfigSchema } from '../src/config/attendance-service-config.schema.js';
import { DATABASE } from '../src/infrastructure/db/database.token.js';
import { workSchedules } from '../src/infrastructure/db/schema.js';
import { attendanceServiceEnvironment } from './attendance-service-environment.js';
import {
  CONTAINER_TIMEOUT_MS,
  MIGRATIONS_FOLDER,
  TEST_TIMEOUT_MS,
  createEmptyDatabaseUri,
} from './test-database.js';

// 2026-10-30 17:00 UTC is already 2026-10-31 in Asia/Jakarta, so the seeded effective date shows the business timezone.
const FIRST_START_INSTANT = new Date('2026-10-30T17:00:00Z');
const LATER_START_INSTANT = new Date('2027-03-01T03:00:00Z');
const FIRST_START_BUSINESS_DATE = '2026-10-31';

let container: StartedPostgreSqlContainer;
let openModules: TestingModule[] = [];

function fixedClock(instant: Date): IClock {
  return { now: () => new Date(instant) };
}

async function startApp(
  databaseUrl: string,
  options: { readonly clockInstant: Date; readonly overrides?: Record<string, string | undefined> },
): Promise<TestingModule> {
  const config = parseConfig(
    AttendanceServiceConfigSchema,
    attendanceServiceEnvironment({ ATTENDANCE_DATABASE_URL: databaseUrl, ...options.overrides }),
  );
  const moduleRef = await Test.createTestingModule({ imports: [createAppModule(config)] })
    .overrideProvider(CLOCK)
    .useValue(fixedClock(options.clockInstant))
    .compile();
  openModules.push(moduleRef);
  await moduleRef.init();
  return moduleRef;
}

async function closeModule(moduleRef: TestingModule): Promise<void> {
  openModules = openModules.filter((openModule) => openModule !== moduleRef);
  await moduleRef.close();
}

async function readSchedules(database: Database) {
  return database.db
    .select({
      name: workSchedules.name,
      timezone: workSchedules.timezone,
      workingWeekdays: workSchedules.workingWeekdays,
      startTime: workSchedules.startTime,
      endTime: workSchedules.endTime,
      lateCheckinGraceMinutes: workSchedules.lateCheckinGraceMinutes,
      earlyCheckoutGraceMinutes: workSchedules.earlyCheckoutGraceMinutes,
      lateCheckoutGraceMinutes: workSchedules.lateCheckoutGraceMinutes,
      effectiveFrom: workSchedules.effectiveFrom,
      effectiveUntil: workSchedules.effectiveUntil,
    })
    .from(workSchedules);
}

describe('default schedule seed', () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18').start();
  }, CONTAINER_TIMEOUT_MS);

  afterAll(async () => {
    await container?.stop();
  }, CONTAINER_TIMEOUT_MS);

  afterEach(async () => {
    await Promise.all(openModules.map((moduleRef) => moduleRef.close()));
    openModules = [];
  });

  it(
    'should seed one open-ended version from the configured defaults when no schedule exists',
    async () => {
      const databaseUrl = await createEmptyDatabaseUri(container.getConnectionUri());

      const moduleRef = await startApp(databaseUrl, { clockInstant: FIRST_START_INSTANT });

      const schedules = await readSchedules(moduleRef.get<Database>(DATABASE));
      expect(schedules).toEqual([
        {
          name: 'Default company schedule',
          timezone: 'Asia/Jakarta',
          workingWeekdays: [1, 2, 3, 4, 5],
          startTime: '09:00:00',
          endTime: '18:00:00',
          lateCheckinGraceMinutes: 15,
          earlyCheckoutGraceMinutes: 0,
          lateCheckoutGraceMinutes: 0,
          effectiveFrom: FIRST_START_BUSINESS_DATE,
          effectiveUntil: null,
        },
      ]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should keep the first seeded version and insert nothing when the app restarts',
    async () => {
      const databaseUrl = await createEmptyDatabaseUri(container.getConnectionUri());
      const firstRun = await startApp(databaseUrl, { clockInstant: FIRST_START_INSTANT });
      await closeModule(firstRun);

      const secondRun = await startApp(databaseUrl, { clockInstant: LATER_START_INSTANT });

      const schedules = await readSchedules(secondRun.get<Database>(DATABASE));
      expect(schedules).toHaveLength(1);
      expect(schedules[0]?.effectiveFrom).toBe(FIRST_START_BUSINESS_DATE);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should keep exactly one version when two instances start on an empty schedule table together',
    async () => {
      const databaseUrl = await createEmptyDatabaseUri(container.getConnectionUri());
      // Migrations run first, so the two starts below race only on the seed.
      const migrationDatabase = createDatabase(databaseUrl);
      try {
        await runMigrations(migrationDatabase, MIGRATIONS_FOLDER);
      } finally {
        await migrationDatabase.close();
      }

      const [firstInstance, secondInstance] = await Promise.all([
        startApp(databaseUrl, { clockInstant: FIRST_START_INSTANT }),
        startApp(databaseUrl, { clockInstant: FIRST_START_INSTANT }),
      ]);

      const schedules = await readSchedules(firstInstance.get<Database>(DATABASE));
      expect(schedules).toHaveLength(1);
      expect(secondInstance.get<Database>(DATABASE)).toBeDefined();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should seed the configured weekdays, times, and graces when the deployment overrides the defaults',
    async () => {
      const databaseUrl = await createEmptyDatabaseUri(container.getConnectionUri());

      const moduleRef = await startApp(databaseUrl, {
        clockInstant: FIRST_START_INSTANT,
        overrides: {
          ATTENDANCE_DEFAULT_SCHEDULE_WORKING_WEEKDAYS: '1,3,5',
          ATTENDANCE_DEFAULT_SCHEDULE_START_TIME: '08:30',
          ATTENDANCE_DEFAULT_SCHEDULE_END_TIME: '17:00',
          ATTENDANCE_DEFAULT_SCHEDULE_LATE_CHECKIN_GRACE_MINUTES: '10',
          ATTENDANCE_DEFAULT_SCHEDULE_EARLY_CHECKOUT_GRACE_MINUTES: '5',
          ATTENDANCE_DEFAULT_SCHEDULE_LATE_CHECKOUT_GRACE_MINUTES: '20',
        },
      });

      const [schedule] = await readSchedules(moduleRef.get<Database>(DATABASE));
      expect(schedule).toMatchObject({
        workingWeekdays: [1, 3, 5],
        startTime: '08:30:00',
        endTime: '17:00:00',
        lateCheckinGraceMinutes: 10,
        earlyCheckoutGraceMinutes: 5,
        lateCheckoutGraceMinutes: 20,
      });
    },
    TEST_TIMEOUT_MS,
  );
});
