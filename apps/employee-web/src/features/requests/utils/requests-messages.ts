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

export const OVERTIME_REQUEST_PAGE_TITLE = 'Request overtime';
export const OVERTIME_REQUEST_PAGE_DESCRIPTION =
  'Ask HR to approve extra working hours. HR reviews each request, and you can follow its status under Requests.';
export const OVERTIME_REQUEST_SUBMITTED_MESSAGE = 'Overtime request submitted.';
export const OVERTIME_BUSINESS_DATE_HINT = 'Today or up to 7 days back. Times are in WIB.';
export const OVERTIME_START_TIME_HINT = 'Up to 4 hours per day, including pending requests.';
export const OVERTIME_END_TIME_HELP_TEXT =
  'Earlier than the start time means the overtime ends after midnight.';
export const OVERTIME_REASON_LABEL = 'Reason';
export const OVERTIME_SUBMIT_LABEL = 'Submit request';
export const OVERTIME_CANCEL_LABEL = 'Cancel';
/** Shown when the server has no schedule for the employee, so the employee cannot pick a valid day (OT-3). */
export const OVERTIME_SCHEDULE_NOT_CONFIGURED_MESSAGE =
  'Your work schedule is not set up yet, so overtime cannot be requested. Contact HR.';
/** A key reused with other content. The form never does that, so this only happens when another attempt used the key. */
export const OVERTIME_IDEMPOTENCY_CONFLICT_MESSAGE =
  'This request conflicts with an earlier attempt. Reload the page and submit it again.';
export const OVERTIME_REQUEST_CONTRACT_MESSAGE =
  'The request could not be prepared. Check the entries and try again.';
