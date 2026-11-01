const MINUTES_PER_HOUR = 60;
/** Shown for a day with no approved overtime, so the cell is never blank or a fabricated 0m. */
export const NO_OVERTIME_TEXT = '—';

/**
 * Formats approved overtime minutes as `Hh Mm` (or `Mm` under an hour) for the History table.
 * The server keeps the seconds of each interval, so the value is rounded to the nearest whole minute for display only.
 * A positive value never displays as zero: anything that rounds below one minute shows `1m`.
 */
export function formatOvertimeDuration(minutes: number): string {
  if (minutes === 0) return NO_OVERTIME_TEXT;
  const wholeMinutes = Math.max(1, Math.round(minutes));
  const hours = Math.floor(wholeMinutes / MINUTES_PER_HOUR);
  const remainderMinutes = wholeMinutes % MINUTES_PER_HOUR;
  if (hours === 0) return `${remainderMinutes}m`;
  return `${hours}h ${remainderMinutes}m`;
}
