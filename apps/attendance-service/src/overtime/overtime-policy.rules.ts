import { toBusinessDate, type BusinessDate } from '@dexa/common';
import type { DaySchedule } from '../classification/punch-classification.rules.js';
import { isWithinSubmissionWindow } from '../requests/request-business-date.rules.js';

/**The business date is today or up to this many days back. */
export const OVERTIME_SUBMISSION_WINDOW_DAYS = 7;

/**Pending plus approved minutes for one business date, with no rounding. */
export const OVERTIME_DAILY_CAP_MINUTES = 240;

const MS_PER_MINUTE = 60_000;

export const OVERTIME_POLICY_VIOLATION = {
  BUSINESS_DATE_OUTSIDE_WINDOW: 'BUSINESS_DATE_OUTSIDE_WINDOW',
  START_NOT_ON_BUSINESS_DATE: 'START_NOT_ON_BUSINESS_DATE',
  END_NOT_AFTER_START: 'END_NOT_AFTER_START',
  START_BEFORE_SCHEDULED_END: 'START_BEFORE_SCHEDULED_END',
  DAILY_CAP_EXCEEDED: 'DAILY_CAP_EXCEEDED',
} as const;

export type OvertimePolicyViolation =
  (typeof OVERTIME_POLICY_VIOLATION)[keyof typeof OVERTIME_POLICY_VIOLATION];

export type OvertimePolicyInput = {
  /** Server instant, read by the caller from IClock. Decides "today" in the business timezone. */
  readonly now: Date;
  readonly businessTimezone: string;
  readonly businessDate: BusinessDate;
  readonly startAt: Date;
  readonly endAt: Date;
  /** The business date's schedule snapshot. A day off has no scheduled end, so any start is allowed. */
  readonly daySchedule: DaySchedule;
  /** Pending plus approved overtime already requested for the business date, in whole minutes. */
  readonly existingActiveMinutes: number;
};

export type OvertimePolicyResult =
  | { readonly kind: 'ok' }
  | { readonly kind: 'violation'; readonly violation: OvertimePolicyViolation };

/**
 * Applies the overtime submission rules. The first failing rule is returned, in the
 * order the employee fixes them: the date, then the interval, then the schedule, then the daily cap. Overlap with
 * other requests is enforced by the database exclusion constraint, not here.
 */
export function evaluateOvertimePolicy(input: OvertimePolicyInput): OvertimePolicyResult {
  const violation = findOvertimeViolation(input);
  return violation === null ? { kind: 'ok' } : { kind: 'violation', violation };
}

function findOvertimeViolation(input: OvertimePolicyInput): OvertimePolicyViolation | null {
  const { now, businessTimezone, businessDate, startAt, endAt, daySchedule } = input;
  const today = toBusinessDate(now, businessTimezone);
  if (
    !isWithinSubmissionWindow({
      businessDate,
      today,
      windowDays: OVERTIME_SUBMISSION_WINDOW_DAYS,
    })
  ) {
    return OVERTIME_POLICY_VIOLATION.BUSINESS_DATE_OUTSIDE_WINDOW;
  }
  if (toBusinessDate(startAt, businessTimezone) !== businessDate) {
    return OVERTIME_POLICY_VIOLATION.START_NOT_ON_BUSINESS_DATE;
  }
  if (endAt.getTime() <= startAt.getTime()) {
    return OVERTIME_POLICY_VIOLATION.END_NOT_AFTER_START;
  }
  if (daySchedule.isWorkingDay && startAt.getTime() < daySchedule.scheduledEndAt.getTime()) {
    return OVERTIME_POLICY_VIOLATION.START_BEFORE_SCHEDULED_END;
  }
  return exceedsDailyCap(input) ? OVERTIME_POLICY_VIOLATION.DAILY_CAP_EXCEEDED : null;
}

// Compared in milliseconds so that a requested interval with seconds is not rounded onto the cap.
function exceedsDailyCap(input: OvertimePolicyInput): boolean {
  const requestedMs = input.endAt.getTime() - input.startAt.getTime();
  const existingMs = input.existingActiveMinutes * MS_PER_MINUTE;
  return existingMs + requestedMs > OVERTIME_DAILY_CAP_MINUTES * MS_PER_MINUTE;
}
