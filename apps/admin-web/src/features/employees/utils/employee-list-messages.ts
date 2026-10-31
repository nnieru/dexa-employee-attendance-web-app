import type { DataTableStatus } from '@dexa/ui';

export const EMPLOYEE_LIST_ERROR_MESSAGE = 'The employee list could not be loaded. Try again.';
export const NO_EMPLOYEES_MESSAGE = 'No employees yet.';
export const NO_SEARCH_MATCHES_MESSAGE =
  'No employees match this search. Try another name or email.';
export const NO_EMPLOYEES_ON_PAGE_MESSAGE =
  'No employees on this page. Go back to an earlier page.';

/**
 * Picks the empty-table message. The three cases need different advice: nothing exists, a search matched
 * nothing, or the page is past the last one.
 */
export function getEmployeeEmptyMessage({
  searchTerm,
  totalItems,
}: {
  searchTerm: string;
  totalItems: number;
}): string {
  if (totalItems > 0) return NO_EMPLOYEES_ON_PAGE_MESSAGE;
  return searchTerm.length > 0 ? NO_SEARCH_MATCHES_MESSAGE : NO_EMPLOYEES_MESSAGE;
}

/** Maps the query state to the table state. An error wins over stale rows, so a failed reload is never hidden. */
export function getEmployeeTableStatus({
  hasError,
  isFetching,
  isPending,
  onRetry,
}: {
  hasError: boolean;
  isFetching: boolean;
  isPending: boolean;
  onRetry: () => void;
}): DataTableStatus {
  if (hasError) return { kind: 'error', message: EMPLOYEE_LIST_ERROR_MESSAGE, onRetry };
  if (isPending) return { kind: 'loading' };
  if (isFetching) return { kind: 'refreshing' };
  return { kind: 'ready' };
}
