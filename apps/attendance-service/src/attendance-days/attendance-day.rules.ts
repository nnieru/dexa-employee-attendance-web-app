import type { BusinessDate } from '@dexa/common';
import type { DaySchedule } from '../classification/punch-classification.rules.js';
import type {
  DayStatusCode,
  InitialCheckInStatusCode,
  InitialCheckOutStatusCode,
  NewAttendanceDay,
  ScheduleVersion,
} from '../punches/punch.repository.interface.js';

/**
 * What creates the day. A punch makes the employee present. A request (overtime or correction) only names the day,
 * so the day waits for HR to decide its outcome (DATABASE §5.4).
 */
export type AttendanceDayOpening = 'PUNCH' | 'REQUEST';

/**
 * The day row that a first punch or a first request creates, with its schedule snapshot and its starting statuses
 * (DATABASE §5.4). Pure: the caller resolves the schedule and the calendar exception.
 */
export function buildAttendanceDay(input: {
  readonly accountId: string;
  readonly businessDate: BusinessDate;
  readonly scheduleVersion: ScheduleVersion;
  readonly daySchedule: DaySchedule;
  readonly opening: AttendanceDayOpening;
}): NewAttendanceDay {
  const { accountId, businessDate, scheduleVersion, daySchedule, opening } = input;
  const isWorkingDay = daySchedule.isWorkingDay;
  return {
    accountId,
    businessDate,
    scheduleVersionId: scheduleVersion.id,
    businessTimezone: daySchedule.timezone,
    isWorkingDay,
    scheduledStartAt: daySchedule.isWorkingDay ? daySchedule.scheduledStartAt : null,
    scheduledEndAt: daySchedule.isWorkingDay ? daySchedule.scheduledEndAt : null,
    ...resolveInitialStatuses(opening, isWorkingDay),
  };
}

function resolveInitialStatuses(
  opening: AttendanceDayOpening,
  isWorkingDay: boolean,
): {
  readonly dayStatusCode: DayStatusCode;
  readonly checkinStatusCode: InitialCheckInStatusCode;
  readonly checkoutStatusCode: InitialCheckOutStatusCode;
} {
  return {
    dayStatusCode: resolveInitialDayStatusCode(opening, isWorkingDay),
    checkinStatusCode: isWorkingDay ? 'PENDING_CHECKIN' : 'CHECKIN_NOT_REQUIRED',
    checkoutStatusCode: isWorkingDay ? 'PENDING_CHECKOUT' : 'CHECKOUT_NOT_REQUIRED',
  };
}

function resolveInitialDayStatusCode(
  opening: AttendanceDayOpening,
  isWorkingDay: boolean,
): DayStatusCode {
  if (opening === 'PUNCH') return 'PRESENT';
  return isWorkingDay ? 'PENDING' : 'DAY_OFF';
}
