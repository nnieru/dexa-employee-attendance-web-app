import type { DataTableStatus } from '@dexa/ui';

export const SUMMARY_PAGE_TITLE = 'History';
export const SUMMARY_PAGE_DESCRIPTION = 'Your attendance by day. Times are shown in WIB.';
export const SUMMARY_LOAD_ERROR_MESSAGE = 'Your attendance history could not be loaded. Try again.';
export const SUMMARY_TABLE_CAPTION = 'Attendance by day';
export const INVALID_RANGE_TABLE_MESSAGE = 'Choose a valid date range to see attendance.';

/** Names the range, so the employee can tell an empty result from a filter that is too narrow (DESIGN §9). */
export function getSummaryEmptyMessage(range: { from: string; to: string }): string {
  return `No attendance was recorded from ${range.from} to ${range.to}.`;
}

/** Maps the query state to the table state. An error wins over stale rows, so a failed reload is never hidden. */
export function getSummaryTableStatus({
  isError,
  isFetching,
  isPending,
  onRetry,
}: {
  isError: boolean;
  isFetching: boolean;
  isPending: boolean;
  onRetry: () => void;
}): DataTableStatus {
  if (isError) return { kind: 'error', message: SUMMARY_LOAD_ERROR_MESSAGE, onRetry };
  if (isPending) return { kind: 'loading' };
  if (isFetching) return { kind: 'refreshing' };
  return { kind: 'ready' };
}
