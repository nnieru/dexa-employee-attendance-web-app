import type { BusinessDate } from '@dexa/common';

const MS_PER_DAY = 86_400_000;
const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Whole calendar days from the earlier business date to the later one. Both inputs are already business dates, so
 * this is calendar arithmetic with no timezone and no clock.
 */
export function calendarDaysBetween(earlier: BusinessDate, later: BusinessDate): number {
  return toUtcDayNumber(later) - toUtcDayNumber(earlier);
}

/**
 * True when the business date is today or up to `windowDays` back. Future dates are outside the
 * window, because a request can only cover a day that has started.
 */
export function isWithinSubmissionWindow(input: {
  readonly businessDate: BusinessDate;
  readonly today: BusinessDate;
  readonly windowDays: number;
}): boolean {
  const daysBack = calendarDaysBetween(input.businessDate, input.today);
  return daysBack >= 0 && daysBack <= input.windowDays;
}

function toUtcDayNumber(businessDate: BusinessDate): number {
  const match = CALENDAR_DATE_PATTERN.exec(businessDate);
  if (match === null) throw new RangeError('Business date must use YYYY-MM-DD');

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  // setUTCFullYear keeps years 0-99 as written; Date.UTC would map them onto 1900-1999.
  const candidate = new Date(0);
  candidate.setUTCFullYear(year, monthIndex, day);
  const isRealDate =
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === monthIndex &&
    candidate.getUTCDate() === day;
  if (!isRealDate) throw new RangeError('Business date is not a real calendar date');
  return candidate.getTime() / MS_PER_DAY;
}
