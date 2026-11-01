// The company timezone as an IANA name (DATABASE §8). The schedule API does not send it to the browser, so the screen
// keeps the same constant as the attendance feature. Features do not import each other, so it is repeated here.
export const BUSINESS_TIME_ZONE = 'Asia/Jakarta';

/** A calendar date as YYYY-MM-DD in the company timezone. */
export type BusinessDate = string;

// en-CA formats as YYYY-MM-DD, the shape of every business date in the API.
const businessDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The WIB calendar date (YYYY-MM-DD) that a server or browser instant falls on. Pure: the caller supplies the instant. */
export function toBusinessDate(instant: Date): BusinessDate {
  return businessDateFormatter.format(instant);
}

// Length of "YYYY-MM-DD".
const BUSINESS_DATE_LENGTH = 10;

/**
 * The business date that is `days` calendar days after `businessDate`. Date arithmetic runs in UTC on the calendar
 * date alone, so the browser timezone cannot shift the result.
 */
export function addCalendarDays(businessDate: BusinessDate, days: number): BusinessDate {
  const date = new Date(`${businessDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, BUSINESS_DATE_LENGTH);
}

/**
 * The earliest date a schedule version may take effect (PRD SCH-4): tomorrow in the company timezone. Today and earlier
 * are never accepted, because a version that already applies today would change punches that are being recorded.
 */
export function getEarliestEffectiveFrom(today: BusinessDate): BusinessDate {
  return addCalendarDays(today, 1);
}
