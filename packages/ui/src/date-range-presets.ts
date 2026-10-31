/** Inclusive range of calendar dates, both as YYYY-MM-DD in the company timezone. */
export type DateRange = {
  from: string;
  to: string;
};

export type DatePresetPeriod = { unit: 'days'; count: number } | { unit: 'months'; count: number };

export type DatePreset = {
  label: string;
  period: DatePresetPeriod;
};

/** Presets end on the app-supplied today (D-17). */
export const DATE_RANGE_PRESETS: readonly DatePreset[] = [
  { label: '1 week', period: { unit: 'days', count: 7 } },
  { label: '1 month', period: { unit: 'months', count: 1 } },
  { label: '3 months', period: { unit: 'months', count: 3 } },
];

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

type CalendarDate = {
  year: number;
  monthIndex: number;
  day: number;
};

/**
 * Returns the range that ends on today and covers the period inclusively (D-52): From is today
 * minus the period plus one day. Month subtraction that lands on a missing day uses the last day
 * of that month, so 2026-10-31 minus one month is 2026-09-30.
 *
 * Throws a RangeError when today is not a real YYYY-MM-DD date: the app supplies it from the
 * server clock, so a malformed value is a programming error, not user input.
 */
export function calculateDateRangePreset(today: string, period: DatePresetPeriod): DateRange {
  const todayDate = parseIsoDate(today);
  const periodStart =
    period.unit === 'days'
      ? addDays(todayDate, -period.count)
      : addMonths(todayDate, -period.count);

  return {
    from: formatIsoDate(addDays(periodStart, 1)),
    to: formatIsoDate(todayDate),
  };
}

function parseIsoDate(isoDate: string): CalendarDate {
  const match = ISO_DATE_PATTERN.exec(isoDate);
  if (!match) {
    throw new RangeError(`Expected a YYYY-MM-DD date, received "${isoDate}".`);
  }

  const requestedDate = {
    year: Number(match[1]),
    monthIndex: Number(match[2]) - 1,
    day: Number(match[3]),
  };
  // Date.UTC rolls 2026-02-30 over to March; comparing the normalized round trip rejects that input.
  const normalizedDate = toCalendarDate(
    Date.UTC(requestedDate.year, requestedDate.monthIndex, requestedDate.day),
  );
  if (formatIsoDate(normalizedDate) !== isoDate) {
    throw new RangeError(`Expected a YYYY-MM-DD date, received "${isoDate}".`);
  }

  return normalizedDate;
}

function formatIsoDate(calendarDate: CalendarDate): string {
  const year = String(calendarDate.year).padStart(4, '0');
  const month = String(calendarDate.monthIndex + 1).padStart(2, '0');
  const day = String(calendarDate.day).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function toCalendarDate(time: number): CalendarDate {
  const date = new Date(time);

  return {
    year: date.getUTCFullYear(),
    monthIndex: date.getUTCMonth(),
    day: date.getUTCDate(),
  };
}

function addDays(calendarDate: CalendarDate, days: number): CalendarDate {
  return toCalendarDate(
    Date.UTC(calendarDate.year, calendarDate.monthIndex, calendarDate.day + days),
  );
}

function addMonths(calendarDate: CalendarDate, months: number): CalendarDate {
  const firstOfTargetMonth = toCalendarDate(
    Date.UTC(calendarDate.year, calendarDate.monthIndex + months, 1),
  );
  // Day 0 of the following month is the last day of the target month.
  const lastDayOfTargetMonth = toCalendarDate(
    Date.UTC(firstOfTargetMonth.year, firstOfTargetMonth.monthIndex + 1, 0),
  ).day;

  return {
    year: firstOfTargetMonth.year,
    monthIndex: firstOfTargetMonth.monthIndex,
    day: Math.min(calendarDate.day, lastDayOfTargetMonth),
  };
}
