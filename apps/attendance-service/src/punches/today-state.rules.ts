import type { BusinessDate } from '@dexa/common';
import {
  checkInClassificationSchema,
  checkOutClassificationSchema,
  type TodayAttendanceResponse,
  type TodayAttendanceState,
} from '@dexa/contracts';
import type { TodayDayRecord, TodayScheduleFields } from './today-state.repository.interface.js';

/**
 * Derives the employee's state from the day's effective columns. Raw entries are not read: they
 * are immutable history, while the effective columns are what an approved correction changes. A day with no
 * effective check-in is not clocked in, even when the day row exists (for example, a day created by a request).
 */
export function deriveTodayState(day: TodayDayRecord | undefined): TodayAttendanceState {
  if (day === undefined || day.effectiveCheckinAt === null) {
    assertNoCheckoutWithoutCheckin(day);
    return { status: 'NOT_CLOCKED_IN' };
  }
  const clockInStatus = checkInClassificationSchema.parse(day.checkinStatusCode);
  if (day.effectiveCheckoutAt === null) {
    return {
      status: 'CLOCKED_IN',
      clockInAt: day.effectiveCheckinAt.toISOString(),
      clockInStatus,
    };
  }
  return {
    status: 'DONE',
    clockInAt: day.effectiveCheckinAt.toISOString(),
    clockInStatus,
    clockOutAt: day.effectiveCheckoutAt.toISOString(),
    clockOutStatus: checkOutClassificationSchema.parse(day.checkoutStatusCode),
  };
}

/**
 * Builds today's response from the business date, the schedule fields to show, and the stored day when there is one.
 * The schedule fields come from the day's snapshot once it exists, or from the version in effect before that.
 */
export function buildTodayAttendance(input: {
  readonly businessDate: BusinessDate;
  readonly schedule: TodayScheduleFields;
  readonly day: TodayDayRecord | undefined;
}): TodayAttendanceResponse {
  const { businessDate, schedule, day } = input;
  const state = deriveTodayState(day);
  if (schedule.isWorkingDay) {
    return {
      businessDate,
      isWorkingDay: true,
      scheduledStartAt: schedule.scheduledStartAt.toISOString(),
      scheduledEndAt: schedule.scheduledEndAt.toISOString(),
      state,
    };
  }
  return {
    businessDate,
    isWorkingDay: false,
    scheduledStartAt: null,
    scheduledEndAt: null,
    state,
  };
}

// The database forbids a check-out without a check-in (attendance_days_effective_checkout_ck), so this state is a
// broken row. It is refused rather than shown as not clocked in.
function assertNoCheckoutWithoutCheckin(day: TodayDayRecord | undefined): void {
  if (day !== undefined && day.effectiveCheckoutAt !== null) {
    throw new Error('The attendance day has a check-out but no effective check-in.');
  }
}
