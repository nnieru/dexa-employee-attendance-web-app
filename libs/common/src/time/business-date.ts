/** A calendar date in the business timezone, formatted YYYY-MM-DD. */
export type BusinessDate = string;

const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TRAILING_DAY_PATTERN = /-\d{2}$/;

/** Returns the calendar date that the instant falls on in the given IANA timezone. */
export function toBusinessDate(instant: Date, timezone: string): BusinessDate {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(instant);
  const year = readDatePart(parts, 'year').padStart(4, '0');
  const month = readDatePart(parts, 'month');
  const day = readDatePart(parts, 'day');
  return `${year}-${month}-${day}`;
}

/** Returns the first day of the month that contains the business date. */
export function getMonthStart(businessDate: BusinessDate): BusinessDate {
  if (!isCalendarDate(businessDate)) {
    throw new Error('Invalid business date: expected a real calendar date in YYYY-MM-DD format');
  }
  return businessDate.replace(TRAILING_DAY_PATTERN, '-01');
}

// Looked up by part type because locales order the date fields differently.
function readDatePart(
  parts: ReadonlyArray<Intl.DateTimeFormatPart>,
  type: Intl.DateTimeFormatPartTypes,
): string {
  const part = parts.find((candidate) => candidate.type === type);
  if (part === undefined) throw new Error(`Date formatter returned no ${type} part`);
  return part.value;
}

function isCalendarDate(value: string): boolean {
  const match = CALENDAR_DATE_PATTERN.exec(value);
  if (match === null) return false;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  // setUTCFullYear keeps years 0-99 as written; Date.UTC would map them onto 1900-1999.
  const candidate = new Date(0);
  candidate.setUTCFullYear(year, monthIndex, day);
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === monthIndex &&
    candidate.getUTCDate() === day
  );
}
