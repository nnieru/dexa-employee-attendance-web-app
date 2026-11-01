import { MAX_PAGE_SIZE, type RequestStatus } from '@dexa/contracts';
import type { DataTableStatus } from '@dexa/ui';
import { getApprovalStatusDisplay } from './approval-display.js';

export const APPROVALS_PAGE_TITLE = 'Approvals';
export const APPROVALS_PAGE_DESCRIPTION =
  'Review overtime and correction requests. You cannot review your own requests. Times are shown in WIB.';
export const OVERTIME_TABLE_CAPTION = 'Overtime requests awaiting review';
export const CORRECTION_TABLE_CAPTION = 'Correction requests awaiting review';
export const APPROVALS_LOAD_ERROR_MESSAGE = 'The approval queue could not be loaded. Try again.';
export const APPROVALS_DETAIL_LOAD_ERROR_MESSAGE = 'The request could not be loaded. Try again.';
export const APPROVALS_DETAIL_INVALID_PATH_MESSAGE = 'This approval link is not valid.';
export { EMPTY_VALUE_TEXT } from './approval-display.js';
export const REVIEW_LINK_LABEL = 'Review';
export const STATUS_FILTER_LABEL = 'Status';
export const ALL_STATUSES_LABEL = 'All';
export const EMPLOYEE_FILTER_LABEL = 'Employee';
export const ALL_EMPLOYEES_OPTION_LABEL = 'All employees';
export const SELECTED_EMPLOYEE_OPTION_LABEL = 'Selected employee';
export const EMPLOYEE_OPTIONS_LOADING_HINT = 'Loading employees.';
export const EMPLOYEE_OPTIONS_ERROR_MESSAGE = 'Employees could not be loaded. Try again.';
export const REQUEST_TYPE_LABEL: Readonly<Record<'overtime' | 'corrections', string>> = {
  overtime: 'Overtime',
  corrections: 'Corrections',
};
export const CURRENT_VALUES_HEADING = 'Current';
export const REQUESTED_VALUES_HEADING = 'Requested';

const REQUEST_TYPE_PLURAL: Readonly<Record<'overtime' | 'corrections', string>> = {
  overtime: 'overtime requests',
  corrections: 'correction requests',
};

/** Names the type and the filter, so an empty table is not mistaken for a missing request (DESIGN §9). */
export function getApprovalsEmptyMessage(
  tab: 'overtime' | 'corrections',
  status: RequestStatus,
): string {
  const typePlural = REQUEST_TYPE_PLURAL[tab];
  const statusText = getApprovalStatusDisplay(status).text;
  return `No ${typePlural} match the status ${statusText}.`;
}

/** The employee filter lists one page at the API's largest size; saying so avoids reading a short list as all staff. */
export function getEmployeeFilterHint({
  isPending,
  totalItems,
  listedCount,
}: {
  isPending: boolean;
  totalItems: number;
  listedCount: number;
}): string | undefined {
  if (isPending) return EMPLOYEE_OPTIONS_LOADING_HINT;
  if (totalItems > listedCount) return `Only the first ${MAX_PAGE_SIZE} employees are listed.`;
  return undefined;
}

/** Maps the query state to the table state. An error wins over stale rows, so a failed reload is never hidden. */
export function getApprovalsTableStatus({
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
  if (isError) return { kind: 'error', message: APPROVALS_LOAD_ERROR_MESSAGE, onRetry };
  if (isPending) return { kind: 'loading' };
  if (isFetching) return { kind: 'refreshing' };
  return { kind: 'ready' };
}
