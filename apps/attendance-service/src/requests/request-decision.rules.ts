/**
 * Request statuses as stored in `overtime_requests.status` and `attendance_adjustment_requests.status`
 * (DATABASE §5.6). The values match the table check constraints.
 */
export const REQUEST_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;

export type RequestStatus = (typeof REQUEST_STATUS)[keyof typeof REQUEST_STATUS];

export type TerminalRequestStatus = typeof REQUEST_STATUS.APPROVED | typeof REQUEST_STATUS.REJECTED;

export const REQUEST_DECISION_VIOLATION = {
  SELF_REVIEW_FORBIDDEN: 'SELF_REVIEW_FORBIDDEN',
  REVIEW_REASON_REQUIRED: 'REVIEW_REASON_REQUIRED',
  DECISION_CONFLICT: 'DECISION_CONFLICT',
} as const;

export type RequestDecisionViolation =
  (typeof REQUEST_DECISION_VIOLATION)[keyof typeof REQUEST_DECISION_VIOLATION];

export type RequestDecisionInput = {
  readonly currentStatus: RequestStatus;
  readonly targetStatus: TerminalRequestStatus;
  readonly requestedByAccountId: string;
  readonly reviewerAccountId: string;
  /** The HR reason. Required when rejecting; optional when approving (APR-2). */
  readonly reviewReason: string | null;
};

export type RequestDecisionResult =
  | { readonly kind: 'apply'; readonly nextStatus: TerminalRequestStatus }
  /** The request already holds this decision. The caller returns the recorded result and writes nothing (APR-3). */
  | { readonly kind: 'replay'; readonly recordedStatus: TerminalRequestStatus }
  | { readonly kind: 'violation'; readonly violation: RequestDecisionViolation };

/**
 * Decides one HR decision on a request (PRD APR-2..APR-4). The checks run in this order: self-review, then the
 * rejection reason, then the state transition. A reviewer who is the requester is refused even when the request is
 * already decided, because a requester never holds the decision (DATABASE §5.6).
 */
export function evaluateRequestDecision(input: RequestDecisionInput): RequestDecisionResult {
  if (input.reviewerAccountId === input.requestedByAccountId) {
    return { kind: 'violation', violation: REQUEST_DECISION_VIOLATION.SELF_REVIEW_FORBIDDEN };
  }
  if (input.targetStatus === REQUEST_STATUS.REJECTED && isBlankReason(input.reviewReason)) {
    return { kind: 'violation', violation: REQUEST_DECISION_VIOLATION.REVIEW_REASON_REQUIRED };
  }
  if (input.currentStatus === REQUEST_STATUS.PENDING) {
    return { kind: 'apply', nextStatus: input.targetStatus };
  }
  if (input.currentStatus === input.targetStatus) {
    return { kind: 'replay', recordedStatus: input.targetStatus };
  }
  return { kind: 'violation', violation: REQUEST_DECISION_VIOLATION.DECISION_CONFLICT };
}

function isBlankReason(reviewReason: string | null): boolean {
  return reviewReason === null || reviewReason.trim().length === 0;
}
