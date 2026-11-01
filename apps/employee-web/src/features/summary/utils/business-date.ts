import type { BusinessDate } from '../types/summary-search.schema.js';

// The company timezone as an IANA name. The summary response carries no timezone (AttendanceSummaryPage has only
// rows and paging), and the API does not send BUSINESS_TIMEZONE to the browser, so the name is kept here, the same
// as the attendance feature keeps it for its own screen.
export const BUSINESS_TIME_ZONE = 'Asia/Jakarta';

// Length of "YYYY-MM", the part of a business date that names its month.
const YEAR_MONTH_LENGTH = 7;

const businessDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const businessDateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** The WIB calendar date (YYYY-MM-DD) that a server instant falls on. Pure: the caller supplies the instant. */
export function toBusinessDate(instant: Date): BusinessDate {
  return businessDateFormatter.format(instant);
}

/** The first day of the month that a business date falls in, for example 2026-11-15 gives 2026-11-01. */
export function getMonthStartBusinessDate(businessDate: BusinessDate): BusinessDate {
  return `${businessDate.slice(0, YEAR_MONTH_LENGTH)}-01`;
}

/** A server instant as `YYYY-MM-DD HH:mm` in the company timezone (PRD SUM-3). */
export function formatBusinessDateTime(instant: string): string {
  const formatted = businessDateTimeFormatter.format(new Date(instant));
  // en-CA puts a comma between the date and the time; the required format has a space.
  return formatted.replace(', ', ' ');
}
