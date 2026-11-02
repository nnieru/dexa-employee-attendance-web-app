import { DEFAULT_PAGE_SIZE, type WorkCalendarDateListQuery } from '@dexa/contracts';
import type { ResolvedCalendarExceptionSearch } from '../types/calendar-exception-search.schema.js';
import type { BusinessDate } from './schedule-business-date.js';
import { getEarliestEditableExceptionDate } from './calendar-exception-dates.js';

export const INVALID_RANGE_DATE_MESSAGE = 'Enter a valid From and To date.';
export const RANGE_ORDER_MESSAGE = 'From must not be after To.';

// Length of "YYYY-MM-DD".
const BUSINESS_DATE_LENGTH = 10;
// Months after today that the default range reaches. A UI default only; the API accepts any range.
const DEFAULT_RANGE_MONTHS_AHEAD = 3;
const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type CalendarExceptionRange = {
  from: BusinessDate;
  to: BusinessDate;
};

/**
 * The range shown when the URL names none: from the first editable date through the last day of the month three months
 * ahead. The screen is for future exceptions, so the default starts tomorrow. Today is passed in so the function stays pure.
 */
export function getDefaultCalendarExceptionRange(today: BusinessDate): CalendarExceptionRange {
  const todayDate = new Date(`${today}T00:00:00.000Z`);
  // Day 0 of the following month is the last day of the month before it.
  const lastDayOfTargetMonth = new Date(
    Date.UTC(
      todayDate.getUTCFullYear(),
      todayDate.getUTCMonth() + DEFAULT_RANGE_MONTHS_AHEAD + 1,
      0,
    ),
  );
  return {
    from: getEarliestEditableExceptionDate(today),
    to: lastDayOfTargetMonth.toISOString().slice(0, BUSINESS_DATE_LENGTH),
  };
}

/** The message for a range that cannot be searched, or undefined when it can. Business dates order as strings. */
export function getCalendarExceptionRangeError(range: CalendarExceptionRange): string | undefined {
  if (!isBusinessDateText(range.from) || !isBusinessDateText(range.to)) {
    return INVALID_RANGE_DATE_MESSAGE;
  }
  if (range.from > range.to) return RANGE_ORDER_MESSAGE;
  return undefined;
}

/** The API query for one URL state. The page size is not in the URL, so it is the shared default. */
export function toCalendarExceptionQuery(
  search: ResolvedCalendarExceptionSearch,
): WorkCalendarDateListQuery {
  return { from: search.from, to: search.to, page: search.page, pageSize: DEFAULT_PAGE_SIZE };
}

/** A real calendar day in YYYY-MM-DD. The URL and the date inputs can hold anything, so February 30 is refused too. */
function isBusinessDateText(value: string): value is BusinessDate {
  if (!BUSINESS_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, BUSINESS_DATE_LENGTH) === value;
}
