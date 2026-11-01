import { randomUUID } from 'node:crypto';
import { CLOCK, configureApp, parseConfig, type IClock } from '@dexa/common';
import type { Database } from '@dexa/db';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq } from 'drizzle-orm';
import { createAppModule } from '../src/app.module.js';
import type { AttendanceDayOpening } from '../src/attendance-days/attendance-day.rules.js';
import { findOrCreateAttendanceDayForUpdate } from '../src/attendance-days/find-or-create-attendance-day.js';
import { AttendanceServiceConfigSchema } from '../src/config/attendance-service-config.schema.js';
import { DATABASE } from '../src/infrastructure/db/database.token.js';
import {
  attendanceDays,
  masterAttendanceStatuses,
  workCalendarDates,
  workSchedules,
} from '../src/infrastructure/db/schema.js';
import { ScheduleNotConfiguredError } from '../src/punches/punch.errors.js';
import {
  PUNCH_REPOSITORY,
  type IPunchRepository,
  type LockedAttendanceDay,
} from '../src/punches/punch.repository.interface.js';
import { attendanceServiceEnvironment } from './attendance-service-environment.js';
import {
  CONTAINER_TIMEOUT_MS,
  TEST_TIMEOUT_MS,
  createEmptyDatabaseUri,
  failureOf,
  requireRow,
} from './test-database.js';

// The default schedule is seeded from the first start, so it takes effect on this Monday (WIB).
const FIRST_START_INSTANT = new Date('2026-11-02T01:00:00Z');
const WORKING_DATE = '2026-11-02';
const SATURDAY = '2026-11-07';
const HOLIDAY_DATE = '2026-11-03';
const BEFORE_SCHEDULE_DATE = '2026-10-01';
// The default schedule is 09:00 to 18:00 WIB.
const SCHEDULED_START_AT = new Date('2026-11-02T02:00:00Z');
const SCHEDULED_END_AT = new Date('2026-11-02T11:00:00Z');
// Each caller takes a pool connection, and the pool holds 10 by default.
const CONCURRENT_CALLERS = 5;
const NO_WAIT_LOCK_FAILURE = '55P03';

const fixedClock: IClock = { now: () => new Date(FIRST_START_INSTANT) };

let container: StartedPostgreSqlContainer;
let app: INestApplication;
let database: Database;
let punches: IPunchRepository;
let scheduleId: string;

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

function findDay(
  accountId: string,
  businessDate: string,
  opening: AttendanceDayOpening,
): Promise<LockedAttendanceDay> {
  return punches.runInTransaction((transaction) =>
    findOrCreateAttendanceDayForUpdate(transaction, { accountId, businessDate, opening }),
  );
}

async function readDays(accountId: string) {
  return database.db.select().from(attendanceDays).where(eq(attendanceDays.accountId, accountId));
}

// The day row stores status ids. The codes are read from the master so the assertions name the statuses.
async function readDayWithStatusCodes(dayId: string) {
  const day = requireRow(
    (await database.db.select().from(attendanceDays).where(eq(attendanceDays.id, dayId)))[0],
  );
  const statuses = await database.db.select().from(masterAttendanceStatuses);
  const codeById = new Map(statuses.map((status) => [status.id, status.code]));
  return {
    ...day,
    dayStatusCode: codeById.get(day.dayStatusId),
    checkinStatusCode: codeById.get(day.checkinStatusId),
    checkoutStatusCode: codeById.get(day.checkoutStatusId),
  };
}

describe('attendance days find or create', () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18').start();
    const databaseUrl = await createEmptyDatabaseUri(container.getConnectionUri());
    app = await startApp(databaseUrl);
    punches = app.get<IPunchRepository>(PUNCH_REPOSITORY);
    await database.db.insert(workCalendarDates).values({
      businessDate: HOLIDAY_DATE,
      isWorkingDay: false,
      description: 'Test holiday',
    });
    const [schedule] = await database.db.select().from(workSchedules);
    scheduleId = requireRow(schedule).id;
  }, CONTAINER_TIMEOUT_MS);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  }, CONTAINER_TIMEOUT_MS);

  it(
    'should create exactly one day when concurrent transactions find or create the same employee and date',
    async () => {
      const accountId = randomUUID();

      const days = await Promise.all(
        Array.from({ length: CONCURRENT_CALLERS }, () =>
          findDay(accountId, WORKING_DATE, 'REQUEST'),
        ),
      );

      expect(new Set(days.map((day) => day.dayId)).size).toBe(1);
      const rows = await readDays(accountId);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.revision).toBe(1);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should snapshot a day off with timing not required when a request is made for a weekend',
    async () => {
      const accountId = randomUUID();

      const day = await findDay(accountId, SATURDAY, 'REQUEST');

      expect(await readDayWithStatusCodes(day.dayId)).toMatchObject({
        businessDate: SATURDAY,
        workScheduleId: scheduleId,
        businessTimezone: 'Asia/Jakarta',
        isWorkingDay: false,
        scheduledStartAt: null,
        scheduledEndAt: null,
        dayStatusCode: 'DAY_OFF',
        checkinStatusCode: 'CHECKIN_NOT_REQUIRED',
        checkoutStatusCode: 'CHECKOUT_NOT_REQUIRED',
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should snapshot a day off with timing not required when the calendar marks a weekday as a holiday',
    async () => {
      const accountId = randomUUID();

      const day = await findDay(accountId, HOLIDAY_DATE, 'REQUEST');

      expect(await readDayWithStatusCodes(day.dayId)).toMatchObject({
        isWorkingDay: false,
        dayStatusCode: 'DAY_OFF',
        checkinStatusCode: 'CHECKIN_NOT_REQUIRED',
        checkoutStatusCode: 'CHECKOUT_NOT_REQUIRED',
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should start the day as PENDING with the schedule snapshot when a request is made for a working day with no punch',
    async () => {
      const accountId = randomUUID();

      const day = await findDay(accountId, WORKING_DATE, 'REQUEST');

      expect(await readDayWithStatusCodes(day.dayId)).toMatchObject({
        workScheduleId: scheduleId,
        businessTimezone: 'Asia/Jakarta',
        isWorkingDay: true,
        scheduledStartAt: SCHEDULED_START_AT,
        scheduledEndAt: SCHEDULED_END_AT,
        dayStatusCode: 'PENDING',
        checkinStatusCode: 'PENDING_CHECKIN',
        checkoutStatusCode: 'PENDING_CHECKOUT',
        revision: 1,
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should keep the day row locked for the rest of the caller transaction when the day is returned',
    async () => {
      const accountId = randomUUID();
      // The day is committed first. A row inserted in the same uncommitted transaction is invisible to a competing one.
      const committed = await findDay(accountId, WORKING_DATE, 'REQUEST');

      await punches.runInTransaction(async (transaction) => {
        const day = await findOrCreateAttendanceDayForUpdate(transaction, {
          accountId,
          businessDate: WORKING_DATE,
          opening: 'REQUEST',
        });
        expect(day.dayId).toBe(committed.dayId);

        const competingLock = database.db.transaction((other) =>
          other
            .select({ id: attendanceDays.id })
            .from(attendanceDays)
            .where(eq(attendanceDays.id, day.dayId))
            .for('update', { noWait: true }),
        );

        expect(await failureOf(competingLock)).toMatchObject({
          sqlState: NO_WAIT_LOCK_FAILURE,
        });
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return the existing day unchanged when a request finds a day that a punch created first',
    async () => {
      const accountId = randomUUID();
      const created = await findDay(accountId, WORKING_DATE, 'PUNCH');

      const found = await findDay(accountId, WORKING_DATE, 'REQUEST');

      expect(found.dayId).toBe(created.dayId);
      expect(await readDays(accountId)).toHaveLength(1);
      expect(await readDayWithStatusCodes(found.dayId)).toMatchObject({
        dayStatusCode: 'PRESENT',
        checkinStatusCode: 'PENDING_CHECKIN',
        checkoutStatusCode: 'PENDING_CHECKOUT',
        revision: 1,
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should reject with ScheduleNotConfiguredError and write no day when no schedule covers the date',
    async () => {
      const accountId = randomUUID();

      await expect(findDay(accountId, BEFORE_SCHEDULE_DATE, 'REQUEST')).rejects.toBeInstanceOf(
        ScheduleNotConfiguredError,
      );
      expect(await readDays(accountId)).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );
});
