// The company timezone as an IANA name. The API does not send BUSINESS_TIMEZONE to the browser, and every approval
// time is shown in WIB.
const BUSINESS_TIME_ZONE = 'Asia/Jakarta';

const dateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** A server instant as `YYYY-MM-DD HH:mm` in the company timezone. */
export function formatApprovalDateTime(instant: string): string {
  return dateTimeFormatter.format(new Date(instant)).replace(', ', ' ');
}

/** A server instant as `HH:mm` in the company timezone, for an interval on one business date. */
export function formatApprovalTime(instant: string): string {
  return formatApprovalDateTime(instant).slice(-5);
}
