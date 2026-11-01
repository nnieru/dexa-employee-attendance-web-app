import {
  ConflictError,
  DomainError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@dexa/common';
import { ErrorCode } from '@dexa/contracts';
import {
  REQUEST_DECISION_VIOLATION,
  type RequestDecisionViolation,
} from './request-decision.rules.js';

/** No request has this ID. Shared by overtime and correction decisions. */
export class RequestNotFoundError extends NotFoundError {
  constructor() {
    super(ErrorCode.REQUEST_NOT_FOUND, 'The request was not found.');
  }
}

/** The reviewer is the requester (APR-4). */
export class SelfReviewForbiddenError extends ForbiddenError {
  constructor() {
    super(ErrorCode.SELF_REVIEW_FORBIDDEN, 'You cannot review your own request.');
  }
}

/** A rejection without a non-blank reason (APR-2, DATABASE §5.6). */
export class ReviewReasonRequiredError extends ValidationError {
  constructor() {
    super(ErrorCode.REVIEW_REASON_REQUIRED, 'A reason is required to reject a request.');
  }
}

/** The request already holds a different decision (APR-3). */
export class RequestAlreadyDecidedError extends ConflictError {
  constructor() {
    super(
      ErrorCode.REQUEST_ALREADY_DECIDED,
      'This request was already decided with a different decision.',
    );
  }
}

// The one place that turns a decision-rule violation into the domain error the exception filter maps.
export function toRequestDecisionError(violation: RequestDecisionViolation): DomainError {
  switch (violation) {
    case REQUEST_DECISION_VIOLATION.SELF_REVIEW_FORBIDDEN:
      return new SelfReviewForbiddenError();
    case REQUEST_DECISION_VIOLATION.REVIEW_REASON_REQUIRED:
      return new ReviewReasonRequiredError();
    case REQUEST_DECISION_VIOLATION.DECISION_CONFLICT:
      return new RequestAlreadyDecidedError();
  }
}
