import { ApiError, FALLBACK_ERROR_MESSAGE } from '@dexa/api-client';
import { ErrorCode } from '@dexa/contracts';

export const DECISION_APPROVED_TITLE = 'Request approved';
export const DECISION_REJECTED_TITLE = 'Request rejected';
export const REVIEW_REASON_REQUIRED_MESSAGE = 'Enter a reason to reject this request.';
export const ATTENDANCE_DAY_CHANGED_MESSAGE =
  'This record changed after the request was created. Reload to review the latest data.';
export const SELF_REVIEW_FORBIDDEN_MESSAGE = 'You cannot review your own request.';
export const REQUEST_ALREADY_DECIDED_MESSAGE =
  'This request was already decided. Reload to see the recorded decision.';

const MESSAGE_BY_ERROR_CODE: Partial<Record<ErrorCode, string>> = {
  [ErrorCode.ATTENDANCE_DAY_CHANGED]: ATTENDANCE_DAY_CHANGED_MESSAGE,
  [ErrorCode.SELF_REVIEW_FORBIDDEN]: SELF_REVIEW_FORBIDDEN_MESSAGE,
  [ErrorCode.REQUEST_ALREADY_DECIDED]: REQUEST_ALREADY_DECIDED_MESSAGE,
  [ErrorCode.REVIEW_REASON_REQUIRED]: REVIEW_REASON_REQUIRED_MESSAGE,
};

/** The message for a refused decision. The server's message is user-safe, so an unknown code falls back to it. */
export function getDecisionErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return FALLBACK_ERROR_MESSAGE;
  return MESSAGE_BY_ERROR_CODE[error.code] ?? error.message;
}

/** True when the day changed under the request, so the detail must be reloaded before another decision (COR-6). */
export function isAttendanceDayChanged(error: unknown): boolean {
  return error instanceof ApiError && error.code === ErrorCode.ATTENDANCE_DAY_CHANGED;
}
