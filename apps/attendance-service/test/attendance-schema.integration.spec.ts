import { parseConfig } from '@dexa/common';
import type { Database } from '@dexa/db';
import { Test, type TestingModule } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createAppModule } from '../src/app.module.js';
import { AttendanceServiceConfigSchema } from '../src/config/attendance-service-config.schema.js';
import { DATABASE } from '../src/infrastructure/db/database.token.js';
import {
  attendanceDays,
  attendanceEntries,
  masterAttendanceStatuses,
  workSchedules,
} from '../src/infrastructure/db/schema.js';
import { attendanceServiceEnvironment } from './attendance-service-environment.js';
import {
  CONTAINER_TIMEOUT_MS,
  TEST_TIMEOUT_MS,
  createEmptyDatabaseUri,
  failureOf,
  requireRow,
} from './test-database.js';

const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';
const EXCLUSION_VIOLATION = '23P01';

const DAY_DATE = '2026-10-30';
const SCHEDULED_START = new Date('2026-10-30T02:00:00Z'); // 09:00 Asia/Jakarta
const SCHEDULED_END = new Date('2026-10-30T11:00:00Z'); // 18:00 Asia/Jakarta

type DayInsert = typeof attendanceDays.$inferInsert;
type ScheduleInsert = typeof workSchedules.$inferInsert;

let container: StartedPostgreSqlContainer;
let openModules: TestingModule[] = [];

async function startApp(databaseUrl: string): Promise<TestingModule> {
  const config = parseConfig(
    AttendanceServiceConfigSchema,
    attendanceServiceEnvironment({ ATTENDANCE_DATABASE_URL: databaseUrl }),
  );
  const moduleRef = await Test.createTestingModule({
    imports: [createAppModule(config)],
  }).compile();
  openModules.push(moduleRef);
  await moduleRef.init();
  return moduleRef;
}

// Starting the app runs the migrations and the default schedule seed, so the database holds the seeded version.
async function startAppOnEmptyDatabase(): Promise<Database> {
  const databaseUrl = await createEmptyDatabaseUri(container.getConnectionUri());
  const moduleRef = await startApp(databaseUrl);
  return moduleRef.get<Database>(DATABASE);
}

async function statusIdOf(database: Database, code: string): Promise<string> {
  const rows = await database.db
    .select({ id: masterAttendanceStatuses.id })
    .from(masterAttendanceStatuses)
    .where(eq(masterAttendanceStatuses.code, code));
  return requireRow(rows[0]).id;
}

async function seededScheduleIdOf(database: Database): Promise<string> {
  const rows = await database.db.select({ id: workSchedules.id }).from(workSchedules).limit(1);
  return requireRow(rows[0]).id;
}

// A working day with the pending statuses, which the first punch would later update.
async function insertWorkingDay(
  database: Database,
  overrides: Partial<DayInsert> = {},
): Promise<string> {
  const values: DayInsert = {
    accountId: randomUUID(),
    businessDate: DAY_DATE,
    workScheduleId: await seededScheduleIdOf(database),
    businessTimezone: 'Asia/Jakarta',
    isWorkingDay: true,
    scheduledStartAt: SCHEDULED_START,
    scheduledEndAt: SCHEDULED_END,
    dayStatusId: await statusIdOf(database, 'PENDING'),
    checkinStatusId: await statusIdOf(database, 'PENDING_CHECKIN'),
    checkoutStatusId: await statusIdOf(database, 'PENDING_CHECKOUT'),
    ...overrides,
  };
  const [row] = await database.db
    .insert(attendanceDays)
    .values(values)
    .returning({ id: attendanceDays.id });
  return requireRow(row).id;
}

async function insertPunch(
  database: Database,
  attendanceDayId: string,
  type: 'IN' | 'OUT',
  recordedAt: Date,
): Promise<string> {
  const [row] = await database.db
    .insert(attendanceEntries)
    .values({ attendanceDayId, type, recordedAt })
    .returning({ id: attendanceEntries.id });
  return requireRow(row).id;
}

async function insertSchedule(
  database: Database,
  overrides: Partial<ScheduleInsert>,
): Promise<void> {
  await database.db.insert(workSchedules).values({
    name: 'Test schedule',
    timezone: 'Asia/Jakarta',
    workingWeekdays: [1, 2, 3, 4, 5],
    startTime: '09:00',
    endTime: '18:00',
    lateCheckinGraceMinutes: 15,
    earlyCheckoutGraceMinutes: 0,
    lateCheckoutGraceMinutes: 0,
    effectiveFrom: '2000-01-01',
    ...overrides,
  });
}

describe('attendance schema constraints', () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18').start();
  }, CONTAINER_TIMEOUT_MS);

  // Teardown still stops the container when setup failed partway through.
  afterAll(async () => {
    await container?.stop();
  }, CONTAINER_TIMEOUT_MS);

  afterEach(async () => {
    await Promise.all(openModules.map((moduleRef) => moduleRef.close()));
    openModules = [];
  });

  describe('punches', () => {
    it(
      'should reject a second IN punch for a day that already has one',
      async () => {
        const database = await startAppOnEmptyDatabase();
        const dayId = await insertWorkingDay(database);
        await insertPunch(database, dayId, 'IN', new Date('2026-10-30T02:05:00Z'));

        const failure = await failureOf(
          insertPunch(database, dayId, 'IN', new Date('2026-10-30T02:30:00Z')),
        );

        expect(failure).toEqual({
          sqlState: UNIQUE_VIOLATION,
          constraint: 'attendance_entries_attendance_day_id_type_uq',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should accept one IN and one OUT punch on the same day',
      async () => {
        const database = await startAppOnEmptyDatabase();
        const dayId = await insertWorkingDay(database);
        await insertPunch(database, dayId, 'IN', new Date('2026-10-30T02:05:00Z'));

        await insertPunch(database, dayId, 'OUT', new Date('2026-10-30T11:01:00Z'));

        const punches = await database.db
          .select({ type: attendanceEntries.type })
          .from(attendanceEntries)
          .where(eq(attendanceEntries.attendanceDayId, dayId));
        expect(punches.map((punch) => punch.type).sort()).toEqual(['IN', 'OUT']);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reject an UPDATE of an attendance entry',
      async () => {
        const database = await startAppOnEmptyDatabase();
        const dayId = await insertWorkingDay(database);
        const punchId = await insertPunch(database, dayId, 'IN', new Date('2026-10-30T02:05:00Z'));

        const failure = await failureOf(
          database.db
            .update(attendanceEntries)
            .set({ recordedAt: new Date('2026-10-30T03:00:00Z') })
            .where(eq(attendanceEntries.id, punchId)),
        );

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'attendance_entries_immutable_ck',
        });
        const [punch] = await database.db
          .select({ recordedAt: attendanceEntries.recordedAt })
          .from(attendanceEntries)
          .where(eq(attendanceEntries.id, punchId));
        expect(punch?.recordedAt).toEqual(new Date('2026-10-30T02:05:00Z'));
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reject a DELETE of an attendance entry',
      async () => {
        const database = await startAppOnEmptyDatabase();
        const dayId = await insertWorkingDay(database);
        const punchId = await insertPunch(database, dayId, 'IN', new Date('2026-10-30T02:05:00Z'));

        const failure = await failureOf(
          database.db.delete(attendanceEntries).where(eq(attendanceEntries.id, punchId)),
        );

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'attendance_entries_immutable_ck',
        });
        const remaining = await database.db
          .select({ id: attendanceEntries.id })
          .from(attendanceEntries)
          .where(eq(attendanceEntries.id, punchId));
        expect(remaining).toHaveLength(1);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('day snapshot', () => {
    it.each([
      { column: 'isWorkingDay', change: { isWorkingDay: false } },
      {
        column: 'scheduledStartAt',
        change: { scheduledStartAt: new Date('2026-10-30T01:00:00Z') },
      },
      { column: 'scheduledEndAt', change: { scheduledEndAt: null } },
      { column: 'businessTimezone', change: { businessTimezone: 'UTC' } },
      { column: 'businessDate', change: { businessDate: '2026-10-31' } },
      { column: 'accountId', change: { accountId: randomUUID() } },
    ])(
      'should reject an UPDATE of $column on an attendance day',
      async ({ change }) => {
        const database = await startAppOnEmptyDatabase();
        const dayId = await insertWorkingDay(database);

        const failure = await failureOf(
          database.db.update(attendanceDays).set(change).where(eq(attendanceDays.id, dayId)),
        );

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'attendance_days_snapshot_immutable_ck',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should accept an UPDATE of the status, revision, and effective times on an attendance day',
      async () => {
        const database = await startAppOnEmptyDatabase();
        const dayId = await insertWorkingDay(database);

        await database.db
          .update(attendanceDays)
          .set({
            checkinStatusId: await statusIdOf(database, 'ON_TIME_CHECKIN'),
            dayStatusId: await statusIdOf(database, 'PRESENT'),
            effectiveCheckinAt: new Date('2026-10-30T02:05:00Z'),
            revision: 2,
          })
          .where(eq(attendanceDays.id, dayId));

        const [day] = await database.db
          .select({ revision: attendanceDays.revision, isWorkingDay: attendanceDays.isWorkingDay })
          .from(attendanceDays)
          .where(eq(attendanceDays.id, dayId));
        expect(day).toEqual({ revision: 2, isWorkingDay: true });
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('schedule versions', () => {
    it(
      'should reject a version that overlaps an existing version with exclusion violation 23P01',
      async () => {
        const database = await startAppOnEmptyDatabase();
        await insertSchedule(database, {
          effectiveFrom: '2000-01-01',
          effectiveUntil: '2000-02-01',
        });

        const failure = await failureOf(
          insertSchedule(database, { effectiveFrom: '2000-01-15', effectiveUntil: '2000-03-01' }),
        );

        expect(failure).toEqual({
          sqlState: EXCLUSION_VIOLATION,
          constraint: 'work_schedules_effective_range_ex',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reject an open-ended version that overlaps the seeded version with exclusion violation 23P01',
      async () => {
        const database = await startAppOnEmptyDatabase();

        const failure = await failureOf(insertSchedule(database, { effectiveFrom: '2100-01-01' }));

        expect(failure.sqlState).toBe(EXCLUSION_VIOLATION);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should accept a version that starts on the day the previous version ends',
      async () => {
        const database = await startAppOnEmptyDatabase();
        await insertSchedule(database, {
          effectiveFrom: '2000-01-01',
          effectiveUntil: '2000-02-01',
        });

        await insertSchedule(database, {
          effectiveFrom: '2000-02-01',
          effectiveUntil: '2000-03-01',
        });

        const rows = await database.db
          .select({ id: workSchedules.id })
          .from(workSchedules)
          .where(eq(workSchedules.effectiveFrom, '2000-02-01'));
        expect(rows).toHaveLength(1);
      },
      TEST_TIMEOUT_MS,
    );
  });
});
