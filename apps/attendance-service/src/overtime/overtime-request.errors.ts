import { ConflictError, ValidationError } from '@dexa/common';
import { ErrorCode } from '@dexa/contracts';
import {
  OVERTIME_POLICY_VIOLATION,
  type OvertimePolicyViolation,
} from './overtime-policy.rules.js';

const POLICY_VIOLATION_ERROR: Record<OvertimePolicyViolation, { code: string; message: string }> = {
  [OVERTIME_POLICY_VIOLATION.BUSINESS_DATE_OUTSIDE_WINDOW]: {
    code: ErrorCode.OVERTIME_BUSINESS_DATE_OUTSIDE_WINDOW,
    message: 'Overtime can be requested for today or up to 7 days back.',
  },
  [OVERTIME_POLICY_VIOLATION.START_NOT_ON_BUSINESS_DATE]: {
    code: ErrorCode.OVERTIME_START_NOT_ON_BUSINESS_DATE,
    message: 'The overtime must start on the business date.',
  },
  [OVERTIME_POLICY_VIOLATION.END_NOT_AFTER_START]: {
    code: ErrorCode.OVERTIME_END_NOT_AFTER_START,
    message: 'The overtime must end after it starts.',
  },
  [OVERTIME_POLICY_VIOLATION.START_BEFORE_SCHEDULED_END]: {
    code: ErrorCode.OVERTIME_START_BEFORE_SCHEDULED_END,
    message: 'On a working day, overtime must start at or after the scheduled end.',
  },
  [OVERTIME_POLICY_VIOLATION.DAILY_CAP_EXCEEDED]: {
    code: ErrorCode.OVERTIME_DAILY_CAP_EXCEEDED,
    message: 'Pending and approved overtime for this date can total at most 4 hours.',
  },
};

/** A policy rule refused the request. The code names the rule, so the client can show it on the field. */
export class OvertimePolicyViolationError extends ValidationError {
  constructor(violation: OvertimePolicyViolation) {
    const { code, message } = POLICY_VIOLATION_ERROR[violation];
    super(code, message);
  }
}

/** The interval overlaps a pending or approved overtime request of the same employee. */
export class OvertimeOverlapError extends ConflictError {
  constructor() {
    super(
      ErrorCode.OVERTIME_OVERLAP,
      'This overtime overlaps a pending or approved overtime request.',
    );
  }
}

/**
 * The same idempotency key was sent with different content. The stored request keeps the key, so the
 * retry is refused rather than answered with the earlier request.
 */
export class IdempotencyKeyConflictError extends ConflictError {
  constructor() {
    super(
      ErrorCode.IDEMPOTENCY_KEY_CONFLICT,
      'This request key was already used for a different request.',
    );
  }
}

/**
 * Another transaction stored a request with the same idempotency key after this one looked for it. It is not a client
 * error: the service reads the stored request and judges this submission against it. It is not a DomainError, so the
 * repository's transaction wrapper passes it through to the service unchanged.
 */
export class OvertimeIdempotencyKeyRaceError extends Error {
  constructor() {
    super('A concurrent submission stored the same idempotency key.');
    this.name = 'OvertimeIdempotencyKeyRaceError';
  }
}
