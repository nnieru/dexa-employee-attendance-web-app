import { ConflictError, ValidationError } from '@dexa/common';
import { ErrorCode } from '@dexa/contracts';
import {
  CORRECTION_POLICY_VIOLATION,
  type CorrectionPolicyViolation,
} from './correction-policy.rules.js';

const POLICY_VIOLATION_ERROR: Record<CorrectionPolicyViolation, { code: string; message: string }> =
  {
    [CORRECTION_POLICY_VIOLATION.BUSINESS_DATE_OUTSIDE_WINDOW]: {
      code: ErrorCode.CORRECTION_BUSINESS_DATE_OUTSIDE_WINDOW,
      message: 'A correction can be requested for today or up to 30 days back.',
    },
    [CORRECTION_POLICY_VIOLATION.CLOCK_IN_REQUIRED]: {
      code: ErrorCode.CORRECTION_CLOCK_IN_REQUIRED,
      message: 'A present correction needs a clock-in time.',
    },
    [CORRECTION_POLICY_VIOLATION.CLOCK_IN_OUTSIDE_BUSINESS_DATE]: {
      code: ErrorCode.CORRECTION_CLOCK_IN_OUTSIDE_BUSINESS_DATE,
      message: 'The clock-in must fall on the business date.',
    },
    [CORRECTION_POLICY_VIOLATION.CLOCK_IN_IN_FUTURE]: {
      code: ErrorCode.CORRECTION_CLOCK_IN_IN_FUTURE,
      message: 'The clock-in cannot be in the future.',
    },
    [CORRECTION_POLICY_VIOLATION.CLOCK_OUT_OUTSIDE_BUSINESS_DATE]: {
      code: ErrorCode.CORRECTION_CLOCK_OUT_OUTSIDE_BUSINESS_DATE,
      message: 'The clock-out must fall on the business date.',
    },
    [CORRECTION_POLICY_VIOLATION.CLOCK_OUT_IN_FUTURE]: {
      code: ErrorCode.CORRECTION_CLOCK_OUT_IN_FUTURE,
      message: 'The clock-out cannot be in the future.',
    },
    [CORRECTION_POLICY_VIOLATION.CLOCK_OUT_NOT_AFTER_CLOCK_IN]: {
      code: ErrorCode.CORRECTION_CLOCK_OUT_NOT_AFTER_CLOCK_IN,
      message: 'The clock-out must be after the clock-in.',
    },
    [CORRECTION_POLICY_VIOLATION.TIMES_NOT_ALLOWED_FOR_LEAVE]: {
      code: ErrorCode.CORRECTION_TIMES_NOT_ALLOWED_FOR_LEAVE,
      message: 'A sick leave or leave correction cannot carry times.',
    },
  };

/** A policy rule refused the correction (PRD COR-1, COR-2). The code names the rule, so the client can show it on the field. */
export class CorrectionPolicyViolationError extends ValidationError {
  constructor(violation: CorrectionPolicyViolation) {
    const { code, message } = POLICY_VIOLATION_ERROR[violation];
    super(code, message);
  }
}

/** The day already has a pending correction (PRD COR-4, DATABASE §5.8). Checked before the insert and guarded by the partial unique index. */
export class CorrectionAlreadyPendingError extends ConflictError {
  constructor() {
    super(
      ErrorCode.CORRECTION_ALREADY_PENDING,
      'This day already has a pending correction. Wait for HR to decide it.',
    );
  }
}

/**
 * Another transaction stored a correction with the same idempotency key after this one looked for it. The service reads
 * the stored correction and judges this submission against it. It is not a DomainError, so the repository's transaction
 * wrapper passes it through to the service unchanged.
 */
export class CorrectionIdempotencyKeyRaceError extends Error {
  constructor() {
    super('A concurrent submission stored the same idempotency key.');
    this.name = 'CorrectionIdempotencyKeyRaceError';
  }
}
