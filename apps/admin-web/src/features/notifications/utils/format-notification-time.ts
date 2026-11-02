// The company timezone. Repeated from the attendance feature on purpose:
// features do not import from each other.
const BUSINESS_TIME_ZONE = 'Asia/Jakarta';
const BUSINESS_TIME_LABEL = 'WIB';

const businessDateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** A server instant as `YYYY-MM-DD HH:mm WIB` in the company timezone. */
export function formatNotificationTime(instant: string): string {
  // en-CA puts a comma between the date and the time; the required format has a space.
  const formatted = businessDateTimeFormatter.format(new Date(instant)).replace(', ', ' ');
  return `${formatted} ${BUSINESS_TIME_LABEL}`;
}
