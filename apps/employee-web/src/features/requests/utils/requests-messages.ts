import type { CorrectionRequest, RequestStatus } from '@dexa/contracts';
import type { RequestTab } from '../types/requests-search.schema.js';
import { getRequestStatusDisplay } from './get-request-status-display.js';

export const REQUESTS_PAGE_TITLE = 'Requests';
export const REQUESTS_PAGE_DESCRIPTION =
  'Ask for overtime or an attendance correction. HR reviews each request. Times are shown in WIB. A pending correction does not change your attendance until HR approves it.';
export const REQUESTS_LOAD_ERROR_MESSAGE = 'Your requests could not be loaded. Try again.';
export const STATUS_FILTER_LABEL = 'Status';
export const ALL_STATUSES_LABEL = 'All';
export const CREATE_OVERTIME_LABEL = 'Request overtime';
export const CREATE_CORRECTION_LABEL = 'Request correction';
export const REQUEST_TAB_LABEL: Readonly<Record<RequestTab, string>> = {
  overtime: 'Overtime',
  corrections: 'Corrections',
};
export const OVERTIME_TABLE_CAPTION = 'Overtime requests';
export const CORRECTION_TABLE_CAPTION = 'Correction requests';
/** Shown where a value does not exist, such as a clock-out that was never requested or a review that has not happened. */
export const EMPTY_VALUE_TEXT = '—';
export const NEXT_DAY_HINT_TEXT = '+1 day';

const REQUEST_TYPE_PLURAL: Readonly<Record<RequestTab, string>> = {
  overtime: 'overtime requests',
  corrections: 'correction requests',
};

/** Names the type and the filter, so an empty table is not mistaken for a missing request (DESIGN §9). */
export function getRequestsEmptyMessage(
  tab: RequestTab,
  status: RequestStatus | undefined,
): string {
  const typePlural = REQUEST_TYPE_PLURAL[tab];
  if (status === undefined) return `You have no ${typePlural} yet.`;
  const statusText = getRequestStatusDisplay(status).text;
  return `No ${typePlural} have the status ${statusText}. Choose All to see every status.`;
}

/** The words for each requested outcome (PRD COR-1). They are the employee's own choice, not a DAY status label. */
export const REQUESTED_OUTCOME_TEXT: Readonly<
  Record<CorrectionRequest['requestedDayStatus'], string>
> = {
  PRESENT: 'Present',
  SICK_LEAVE: 'Sick leave',
  LEAVE: 'Leave',
};
