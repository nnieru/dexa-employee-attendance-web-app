import type { BusinessDate } from '@dexa/common';
import type { DaySchedule } from '../classification/punch-classification.rules.js';
import { buildAttendanceDay } from '../attendance-days/attendance-day.rules.js';
import type { NewAttendanceDay, ScheduleVersion } from './punch.repository.interface.js';

/**
 * The day row that a first punch creates (DATABASE §5.4). The day is PRESENT because the punch is its first
 * effective presence. A working day waits for its check-in and check-out classification; a day off has both
 * timing statuses not required.
 */
export function buildNewAttendanceDay(input: {
  readonly accountId: string;
  readonly businessDate: BusinessDate;
  readonly scheduleVersion: ScheduleVersion;
  readonly daySchedule: DaySchedule;
}): NewAttendanceDay {
  return buildAttendanceDay({ ...input, opening: 'PUNCH' });
}
