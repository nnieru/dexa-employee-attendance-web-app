import { DomainError, readUniqueViolationConstraint, type BusinessDate } from '@dexa/common';
import type { Database } from '@dexa/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull, lte, or, sql } from 'drizzle-orm';
import type {
  CalendarExceptionInput,
  DaySchedule,
} from '../classification/punch-classification.rules.js';
import { DATABASE } from '../infrastructure/db/database.token.js';
import { wrapStorageError } from '../infrastructure/db/storage-errors.js';
import {
  attendanceDays,
  attendanceEntries,
  masterAttendanceStatuses,
  workCalendarDates,
  workSchedules,
} from '../infrastructure/db/schema.js';
import { AttendanceAlreadyClockedInError } from './punch.errors.js';
import type {
  AttendanceStatusCode,
  DayCheckInUpdate,
  IPunchRepository,
  IPunchTransaction,
  LockedAttendanceDay,
  NewAttendanceDay,
  NewAttendanceEntry,
  ScheduleVersion,
} from './punch.repository.interface.js';

// The unique key that makes one IN and one OUT per day (DATABASE §5.5). Named in the migration, so a duplicate
// punch is recognized by this name and not by any other unique violation.
const ENTRY_DAY_TYPE_CONSTRAINT = 'attendance_entries_attendance_day_id_type_uq';

// Only the statements below run in the transaction, so the runner needs these methods.
type PunchRunner = Pick<Database['db'], 'select' | 'insert' | 'update'>;

@Injectable()
export class PunchRepository implements IPunchRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async runInTransaction<TResult>(
    work: (transaction: IPunchTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    try {
      return await this.database.db.transaction((transaction) =>
        work(createTransactionScope(transaction)),
      );
    } catch (error: unknown) {
      if (error instanceof DomainError) throw error;
      throw wrapStorageError(error, 'Could not record the punch.');
    }
  }
}

function createTransactionScope(runner: PunchRunner): IPunchTransaction {
  return {
    findScheduleInEffect: (businessDate) => findScheduleInEffect(runner, businessDate),
    findCalendarException: (businessDate) => findCalendarException(runner, businessDate),
    insertDayIfMissing: (day) => insertDayIfMissing(runner, day),
    findDayForUpdate: (accountId, businessDate) =>
      findDayForUpdate(runner, accountId, businessDate),
    insertEntry: (entry) => insertEntry(runner, entry),
    updateDayCheckIn: (update) => updateDayCheckIn(runner, update),
  };
}

// A version covers the date when it starts on or before the date and has no end or ends after it (DATABASE §5.2).
// The exclusion constraint keeps at most one version covering any date.
async function findScheduleInEffect(
  runner: PunchRunner,
  businessDate: BusinessDate,
): Promise<ScheduleVersion | undefined> {
  const [row] = await runner
    .select({
      id: workSchedules.id,
      timezone: workSchedules.timezone,
      workingWeekdays: workSchedules.workingWeekdays,
      startTime: workSchedules.startTime,
      endTime: workSchedules.endTime,
      lateCheckinGraceMinutes: workSchedules.lateCheckinGraceMinutes,
      earlyCheckoutGraceMinutes: workSchedules.earlyCheckoutGraceMinutes,
      lateCheckoutGraceMinutes: workSchedules.lateCheckoutGraceMinutes,
    })
    .from(workSchedules)
    .where(
      and(
        lte(workSchedules.effectiveFrom, businessDate),
        or(isNull(workSchedules.effectiveUntil), gt(workSchedules.effectiveUntil, businessDate)),
      ),
    )
    .limit(1);
  return row;
}

async function findCalendarException(
  runner: PunchRunner,
  businessDate: BusinessDate,
): Promise<CalendarExceptionInput | null> {
  const [row] = await runner
    .select({ isWorkingDay: workCalendarDates.isWorkingDay })
    .from(workCalendarDates)
    .where(eq(workCalendarDates.businessDate, businessDate))
    .limit(1);
  return row ?? null;
}

// The conflict target names the unique key, so an insert for another employee's day or another constraint still fails.
async function insertDayIfMissing(runner: PunchRunner, day: NewAttendanceDay): Promise<void> {
  const dayStatusId = await findStatusId(runner, day.dayStatusCode);
  const checkinStatusId = await findStatusId(runner, day.checkinStatusCode);
  const checkoutStatusId = await findStatusId(runner, day.checkoutStatusCode);
  await runner
    .insert(attendanceDays)
    .values({
      accountId: day.accountId,
      businessDate: day.businessDate,
      workScheduleId: day.scheduleVersionId,
      businessTimezone: day.businessTimezone,
      isWorkingDay: day.isWorkingDay,
      scheduledStartAt: day.scheduledStartAt,
      scheduledEndAt: day.scheduledEndAt,
      dayStatusId,
      checkinStatusId,
      checkoutStatusId,
    })
    .onConflictDoNothing({ target: [attendanceDays.accountId, attendanceDays.businessDate] });
}

// The schedule is joined for its grace minutes. A version that a day references is never edited while it is in
// effect (DATABASE §5.2), so these graces are the day's snapshot. FOR UPDATE locks only the day row.
async function findDayForUpdate(
  runner: PunchRunner,
  accountId: string,
  businessDate: BusinessDate,
): Promise<LockedAttendanceDay | undefined> {
  const [row] = await runner
    .select({
      dayId: attendanceDays.id,
      timezone: attendanceDays.businessTimezone,
      isWorkingDay: attendanceDays.isWorkingDay,
      scheduledStartAt: attendanceDays.scheduledStartAt,
      scheduledEndAt: attendanceDays.scheduledEndAt,
      lateCheckinGraceMinutes: workSchedules.lateCheckinGraceMinutes,
      earlyCheckoutGraceMinutes: workSchedules.earlyCheckoutGraceMinutes,
      lateCheckoutGraceMinutes: workSchedules.lateCheckoutGraceMinutes,
    })
    .from(attendanceDays)
    .innerJoin(workSchedules, eq(workSchedules.id, attendanceDays.workScheduleId))
    .where(
      and(eq(attendanceDays.accountId, accountId), eq(attendanceDays.businessDate, businessDate)),
    )
    .limit(1)
    .for('update', { of: attendanceDays });
  if (row === undefined) return undefined;
  return { dayId: row.dayId, daySchedule: toDaySchedule(row) };
}

// The database checks make a working day always carry both instants (attendance_days_working_day_schedule_ck),
// so a missing instant is a broken row, not a case to classify.
function toDaySchedule(row: {
  readonly timezone: string;
  readonly isWorkingDay: boolean;
  readonly scheduledStartAt: Date | null;
  readonly scheduledEndAt: Date | null;
  readonly lateCheckinGraceMinutes: number;
  readonly earlyCheckoutGraceMinutes: number;
  readonly lateCheckoutGraceMinutes: number;
}): DaySchedule {
  if (!row.isWorkingDay) {
    return {
      isWorkingDay: false,
      timezone: row.timezone,
      scheduledStartAt: null,
      scheduledEndAt: null,
    };
  }
  if (row.scheduledStartAt === null || row.scheduledEndAt === null) {
    throw new Error('A working day has no scheduled start or end.');
  }
  return {
    isWorkingDay: true,
    timezone: row.timezone,
    scheduledStartAt: row.scheduledStartAt,
    scheduledEndAt: row.scheduledEndAt,
    lateCheckinGraceMinutes: row.lateCheckinGraceMinutes,
    earlyCheckoutGraceMinutes: row.earlyCheckoutGraceMinutes,
    lateCheckoutGraceMinutes: row.lateCheckoutGraceMinutes,
  };
}

async function insertEntry(runner: PunchRunner, entry: NewAttendanceEntry): Promise<void> {
  try {
    await runner.insert(attendanceEntries).values({
      attendanceDayId: entry.attendanceDayId,
      type: entry.type,
      recordedAt: entry.recordedAt,
    });
  } catch (error: unknown) {
    if (readUniqueViolationConstraint(error) === ENTRY_DAY_TYPE_CONSTRAINT) {
      throw new AttendanceAlreadyClockedInError();
    }
    throw error;
  }
}

// revision is incremented in SQL, so the increment is applied to the value the locked row holds.
async function updateDayCheckIn(runner: PunchRunner, update: DayCheckInUpdate): Promise<void> {
  const checkinStatusId = await findStatusId(runner, update.checkinStatusCode);
  await runner
    .update(attendanceDays)
    .set({
      effectiveCheckinAt: update.effectiveCheckinAt,
      checkinStatusId,
      revision: sql`${attendanceDays.revision} + 1`,
    })
    .where(eq(attendanceDays.id, update.dayId));
}

// The status codes are seeded by migration 0003 (DATABASE §5.1). A missing code means the schema is broken, so the
// error is not a client error.
async function findStatusId(runner: PunchRunner, code: AttendanceStatusCode): Promise<string> {
  const [row] = await runner
    .select({ id: masterAttendanceStatuses.id })
    .from(masterAttendanceStatuses)
    .where(eq(masterAttendanceStatuses.code, code))
    .limit(1);
  if (row === undefined) throw new Error(`The attendance status ${code} is not seeded.`);
  return row.id;
}
