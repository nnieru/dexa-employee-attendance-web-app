// The company timezone as an IANA name. The request responses carry UTC instants only, and the API does not send
// BUSINESS_TIMEZONE to the browser, so the name is kept here. The summary and attendance features keep their own copies
// for the same reason (features do not import from each other).
const BUSINESS_TIME_ZONE = 'Asia/Jakarta';

/** A calendar date as YYYY-MM-DD in the company timezone. */
export type BusinessDate = string;

const businessDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const clockTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: BUSINESS_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** The WIB calendar date (YYYY-MM-DD) that an instant falls on. Pure: the caller supplies the instant. */
export function toBusinessDate(instant: Date): BusinessDate {
  return businessDateFormatter.format(instant);
}

/** A UTC instant as HH:mm in the company timezone. The column header names the zone, so no suffix is added. */
export function formatBusinessClockTime(instant: string): string {
  return clockTimeFormatter.format(new Date(instant));
}

const zonedWallClockFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const MILLISECONDS_PER_SECOND = 1000;
const MILLISECONDS_PER_DAY = 86_400_000;
// Length of "YYYY-MM-DD".
const BUSINESS_DATE_LENGTH = 10;
const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
/** HH:mm on a 24-hour clock, the form's time entry. */
export const CLOCK_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * The wall-clock reading of an instant in the company timezone, written as if it were UTC. The difference from the
 * instant itself is the zone's offset. Read from Intl, so no offset value is written in this file.
 */
function toWallClockMilliseconds(instantMilliseconds: number): number {
  const parts = zonedWallClockFormatter.formatToParts(new Date(instantMilliseconds));
  const readPart = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(
    readPart('year'),
    readPart('month') - 1,
    readPart('day'),
    readPart('hour'),
    readPart('minute'),
    readPart('second'),
  );
}

/** The zone offset in milliseconds at an instant, with the sub-second part dropped (the formatter has no milliseconds). */
function getZoneOffsetMilliseconds(instantMilliseconds: number): number {
  const wholeSecondMilliseconds =
    Math.floor(instantMilliseconds / MILLISECONDS_PER_SECOND) * MILLISECONDS_PER_SECOND;
  return toWallClockMilliseconds(wholeSecondMilliseconds) - wholeSecondMilliseconds;
}

/**
 * The UTC instant (ISO text with a Z suffix) at which the company clock shows the given HH:mm on the given business
 * date. The business date is a WIB calendar date, so 00:00 on 2026-11-02 is 2026-11-01T17:00:00.000Z. Pure: no clock
 * is read. Throws a RangeError when the date or the time is not a real calendar value; the form schema checks both first.
 */
export function toBusinessInstant(businessDate: BusinessDate, clockTime: string): string {
  if (!isBusinessDate(businessDate) || !CLOCK_TIME_PATTERN.test(clockTime)) {
    throw new RangeError('The business date or clock time is not a valid value.');
  }
  const wallClockMilliseconds = Date.parse(`${businessDate}T${clockTime}:00.000Z`);
  // One correction step: the offset is looked up at the approximate instant, then at the instant it gives.
  const approximateInstant =
    wallClockMilliseconds - getZoneOffsetMilliseconds(wallClockMilliseconds);
  const instantMilliseconds = wallClockMilliseconds - getZoneOffsetMilliseconds(approximateInstant);
  return new Date(instantMilliseconds).toISOString();
}

/**
 * True for a real calendar date written YYYY-MM-DD. Date.parse rolls 2026-02-30 over to March, so the text is compared
 * with its own round trip as well as checked for shape.
 */
export function isBusinessDate(value: string): value is BusinessDate {
  return BUSINESS_DATE_PATTERN.test(value) && shiftBusinessDate(value, 0) === value;
}

/** The business date that is `days` calendar days after (or before, when negative) the given one. Pure calendar arithmetic. */
export function shiftBusinessDate(businessDate: BusinessDate, days: number): BusinessDate {
  const shiftedMilliseconds =
    Date.parse(`${businessDate}T00:00:00.000Z`) + days * MILLISECONDS_PER_DAY;
  return new Date(shiftedMilliseconds).toISOString().slice(0, BUSINESS_DATE_LENGTH);
}
