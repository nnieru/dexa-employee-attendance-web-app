// The company timezone as an IANA name. The request responses carry UTC instants only, and the API does not send
// BUSINESS_TIMEZONE to the browser, so the name is kept here. The summary and attendance features keep their own copies
// for the same reason (features do not import from each other, AGENTS §10).
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
