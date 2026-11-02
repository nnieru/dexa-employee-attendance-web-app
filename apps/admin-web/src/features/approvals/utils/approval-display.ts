import type {
  CorrectionRequest,
  CorrectionRequestReviewItem,
  RequestRequester,
  RequestStatus,
} from '@dexa/contracts';
import type { StatusLabelProps } from '@dexa/ui';
import { formatApprovalTime } from './approval-time.js';

/** Shown where a value does not exist, such as a clock-out that was never requested or a review that has not happened. */
export const EMPTY_VALUE_TEXT = '—';

type ApprovalStatusDisplay = {
  text: string;
  tone: NonNullable<StatusLabelProps['tone']>;
};

const REQUEST_STATUS_DISPLAY: Readonly<Record<RequestStatus, ApprovalStatusDisplay>> = {
  PENDING: { text: 'Awaiting approval', tone: 'warning' },
  APPROVED: { text: 'Approved', tone: 'success' },
  REJECTED: { text: 'Rejected', tone: 'error' },
};

/** The text carries the meaning; the tone only adds colour. */
export function getApprovalStatusDisplay(status: RequestStatus): ApprovalStatusDisplay {
  return REQUEST_STATUS_DISPLAY[status];
}

export const REQUESTED_OUTCOME_TEXT: Readonly<
  Record<CorrectionRequest['requestedDayStatus'], string>
> = {
  PRESENT: 'Present',
  SICK_LEAVE: 'Sick leave',
  LEAVE: 'Leave',
};

export const DAY_STATUS_TEXT: Readonly<
  Record<CorrectionRequestReviewItem['current']['dayStatus'], string>
> = {
  PENDING: 'Pending',
  PRESENT: 'Present',
  NOT_ATTEND: 'Not attended',
  SICK_LEAVE: 'Sick leave',
  LEAVE: 'Leave',
  DAY_OFF: 'Day off',
};

export function getRequesterName(requester: RequestRequester): string {
  return requester.name ?? 'Unavailable';
}

/** A requested interval as `HH:mm–HH:mm` in WIB. */
export function formatApprovalInterval(startAt: string, endAt: string): string {
  return `${formatApprovalTime(startAt)}–${formatApprovalTime(endAt)}`;
}

/** A value that a request does not carry, such as a clock-out on a leave outcome. */
export function formatOptionalTime(instant: string | null): string {
  return instant === null ? EMPTY_VALUE_TEXT : formatApprovalTime(instant);
}
