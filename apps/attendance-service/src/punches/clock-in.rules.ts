import type { BusinessDate } from '@dexa/common';
import type { DaySchedule } from '../classification/punch-classification.rules.js';
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
  const { accountId, businessDate, scheduleVersion, daySchedule } = input;
  const isWorkingDay = daySchedule.isWorkingDay;
  return {
    accountId,
    businessDate,
    scheduleVersionId: scheduleVersion.id,
    businessTimezone: daySchedule.timezone,
    isWorkingDay,
    scheduledStartAt: daySchedule.isWorkingDay ? daySchedule.scheduledStartAt : null,
    scheduledEndAt: daySchedule.isWorkingDay ? daySchedule.scheduledEndAt : null,
    dayStatusCode: 'PRESENT',
    checkinStatusCode: isWorkingDay ? 'PENDING_CHECKIN' : 'CHECKIN_NOT_REQUIRED',
    checkoutStatusCode: isWorkingDay ? 'PENDING_CHECKOUT' : 'CHECKOUT_NOT_REQUIRED',
  };
}
