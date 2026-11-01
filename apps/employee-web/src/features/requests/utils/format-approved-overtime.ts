const MINUTES_FORMATTER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

/**
 * Approved overtime in minutes for the current-record panel. The server keeps the seconds of each interval (OT-4), so
 * the value is shown with up to two decimals rather than rounded to a whole minute.
 */
export function formatApprovedOvertime(minutes: number): string {
  return `${MINUTES_FORMATTER.format(minutes)} min`;
}
