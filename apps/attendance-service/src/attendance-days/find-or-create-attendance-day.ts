import type { BusinessDate } from '@dexa/common';
import { resolveDaySchedule } from '../classification/punch-classification.rules.js';
import type { LockedAttendanceDay } from '../punches/punch.repository.interface.js';
import { ScheduleNotConfiguredError } from '../punches/punch.errors.js';
import type { AttendanceDayTransaction } from './attendance-day.repository.interface.js';
import { buildAttendanceDay, type AttendanceDayOpening } from './attendance-day.rules.js';

export type FindOrCreateAttendanceDayInput = {
  readonly accountId: string;
  readonly businessDate: BusinessDate;
  readonly opening: AttendanceDayOpening;
};

/**
 * Finds the employee's day for the business date, or creates it with the schedule snapshot in effect, and locks it
 * for the rest of the caller's transaction. Call it in the transaction that writes to the day.
 * Rejects with ScheduleNotConfiguredError, and writes nothing, when no schedule version covers the date.
 */
export async function findOrCreateAttendanceDayForUpdate(
  transaction: AttendanceDayTransaction,
  input: FindOrCreateAttendanceDayInput,
): Promise<LockedAttendanceDay> {
  const { accountId, businessDate, opening } = input;
  const scheduleVersion = await transaction.findScheduleInEffect(businessDate);
  if (scheduleVersion === undefined) throw new ScheduleNotConfiguredError();

  const calendarException = await transaction.findCalendarException(businessDate);
  const daySchedule = resolveDaySchedule({ businessDate, scheduleVersion, calendarException });
  // Concurrent creators are serialized by the insert: the second waits for the first to commit, then does nothing.
  // An existing day keeps its stored snapshot and statuses.
  await transaction.insertDayIfMissing(
    buildAttendanceDay({ accountId, businessDate, scheduleVersion, daySchedule, opening }),
  );
  const day = await transaction.findDayForUpdate(accountId, businessDate);
  if (day === undefined) throw new Error('The attendance day was not found after it was inserted.');
  return day;
}
