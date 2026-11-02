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

/** Names the type and the filter, so an empty table is not mistaken for a missing request. */
export function getRequestsEmptyMessage(
  tab: RequestTab,
  status: RequestStatus | undefined,
): string {
  const typePlural = REQUEST_TYPE_PLURAL[tab];
  if (status === undefined) return `You have no ${typePlural} yet.`;
  const statusText = getRequestStatusDisplay(status).text;
  return `No ${typePlural} have the status ${statusText}. Choose All to see every status.`;
}

/** The words for each requested outcome. They are the employee's own choice, not a DAY status label. */
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
/** Shown when the server has no schedule for the employee, so the employee cannot pick a valid day. */
export const OVERTIME_SCHEDULE_NOT_CONFIGURED_MESSAGE =
  'Your work schedule is not set up yet, so overtime cannot be requested. Contact HR.';
/** A key reused with other content. The form never does that, so this only happens when another attempt used the key. */
export const OVERTIME_IDEMPOTENCY_CONFLICT_MESSAGE =
  'This request conflicts with an earlier attempt. Reload the page and submit it again.';
export const OVERTIME_REQUEST_CONTRACT_MESSAGE =
  'The request could not be prepared. Check the entries and try again.';

/** Shown when a submission cannot be turned into a request that passes the shared contract (nothing was sent). */
export const REQUEST_CONTRACT_MESSAGE =
  'The request could not be prepared. Check the entries and try again.';

export const CORRECTION_REQUEST_PAGE_TITLE = 'Request correction';
export const CORRECTION_REQUEST_PAGE_DESCRIPTION =
  "Ask HR to correct a day's attendance. HR reviews each request. Your attendance record does not change until HR approves it.";
export const CORRECTION_REQUEST_SUBMITTED_MESSAGE = 'Correction request submitted.';
export const CORRECTION_BUSINESS_DATE_HINT = 'Today or up to 30 days back. Times are in WIB.';
export const CORRECTION_OUTCOME_LEGEND = 'Requested outcome';
export const CORRECTION_CLOCK_IN_LABEL = 'Clock in (WIB)';
export const CORRECTION_CLOCK_IN_HINT = 'Required for a present day.';
export const CORRECTION_CLOCK_OUT_LABEL = 'Clock out (WIB)';
export const CORRECTION_CLOCK_OUT_HINT = 'Optional. Leave it empty if you do not know it.';
export const CORRECTION_REASON_LABEL = 'Reason';
export const CORRECTION_SUBMIT_LABEL = 'Submit request';
export const CORRECTION_CANCEL_LABEL = 'Cancel';
/** Shown above the form, because the employee already has a pending correction for the date. */
export const CORRECTION_ALREADY_PENDING_MESSAGE =
  'You already have a pending correction for this date. Wait for HR to decide it.';
// Reuses the overtime copy as the correction spec asks. It names overtime, so it should be generalized with a shared copy home.
export const CORRECTION_SCHEDULE_NOT_CONFIGURED_MESSAGE =
  'Your work schedule is not set up yet, so a correction cannot be requested. Contact HR.';

export const CURRENT_RECORD_HEADING_PREFIX = 'Current record for';
export const CURRENT_RECORD_EMPTY_MESSAGE = 'No record for this date.';
export const CURRENT_RECORD_CHOOSE_DATE_MESSAGE =
  'Choose a date within the last 30 days to see its current record.';
export const CURRENT_RECORD_LOADING_MESSAGE = 'Loading the current record…';
export const CURRENT_RECORD_LOAD_ERROR_MESSAGE =
  'The current record could not be loaded. You can still submit a request.';
export const CURRENT_RECORD_TRY_AGAIN_LABEL = 'Try again';
export const CURRENT_RECORD_NOT_RECORDED_TEXT = 'Not recorded';
export const CURRENT_RECORD_CLOCK_IN_LABEL = 'Clock in';
export const CURRENT_RECORD_CLOCK_OUT_LABEL = 'Clock out';
export const CURRENT_RECORD_DAY_STATUS_LABEL = 'Day status';
export const CURRENT_RECORD_OVERTIME_LABEL = 'Approved overtime';
