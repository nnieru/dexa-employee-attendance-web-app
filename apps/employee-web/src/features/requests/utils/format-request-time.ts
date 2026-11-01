import { EMPTY_VALUE_TEXT } from './requests-messages.js';
import { formatBusinessClockTime, toBusinessDate, type BusinessDate } from './business-time.js';

const RANGE_SEPARATOR = '–';

type RequestTimeRange = {
  /** The requested window as HH:mm–HH:mm in WIB. */
  text: string;
  /** True when the end falls on a later WIB date than the request's business date, so the hint `+1 day` applies. */
  isNextDay: boolean;
};

export function formatRequestTimeRange(
  startAt: string,
  endAt: string,
  businessDate: BusinessDate,
): RequestTimeRange {
  return {
    text: `${formatBusinessClockTime(startAt)}${RANGE_SEPARATOR}${formatBusinessClockTime(endAt)}`,
    isNextDay: toBusinessDate(new Date(endAt)) > businessDate,
  };
}

/** A clock-in or clock-out as HH:mm in WIB, or the dash when the request carries no time for it. */
export function formatOptionalClockTime(instant: string | null): string {
  return instant === null ? EMPTY_VALUE_TEXT : formatBusinessClockTime(instant);
}
