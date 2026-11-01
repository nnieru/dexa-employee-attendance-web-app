import { toBusinessDate, type BusinessDate } from '@dexa/common';
import { isWithinSubmissionWindow } from '../requests/request-business-date.rules.js';

/** PRD COR-1: the business date is today or up to this many days back, including days with no punch. */
export const CORRECTION_SUBMISSION_WINDOW_DAYS = 30;

/**
 * The requested day outcomes a correction can ask for (DATABASE §5.8). Values match the DAY master codes, so they
 * are stored as they are.
 */
export const REQUESTED_CORRECTION_OUTCOME = {
  PRESENT: 'PRESENT',
  SICK_LEAVE: 'SICK_LEAVE',
  LEAVE: 'LEAVE',
} as const;

export type RequestedCorrectionOutcome =
  (typeof REQUESTED_CORRECTION_OUTCOME)[keyof typeof REQUESTED_CORRECTION_OUTCOME];

export const CORRECTION_POLICY_VIOLATION = {
  BUSINESS_DATE_OUTSIDE_WINDOW: 'BUSINESS_DATE_OUTSIDE_WINDOW',
  CLOCK_IN_REQUIRED: 'CLOCK_IN_REQUIRED',
  CLOCK_IN_OUTSIDE_BUSINESS_DATE: 'CLOCK_IN_OUTSIDE_BUSINESS_DATE',
  CLOCK_IN_IN_FUTURE: 'CLOCK_IN_IN_FUTURE',
  CLOCK_OUT_OUTSIDE_BUSINESS_DATE: 'CLOCK_OUT_OUTSIDE_BUSINESS_DATE',
  CLOCK_OUT_IN_FUTURE: 'CLOCK_OUT_IN_FUTURE',
  CLOCK_OUT_NOT_AFTER_CLOCK_IN: 'CLOCK_OUT_NOT_AFTER_CLOCK_IN',
  TIMES_NOT_ALLOWED_FOR_LEAVE: 'TIMES_NOT_ALLOWED_FOR_LEAVE',
} as const;

export type CorrectionPolicyViolation =
  (typeof CORRECTION_POLICY_VIOLATION)[keyof typeof CORRECTION_POLICY_VIOLATION];

export type CorrectionPolicyInput = {
  /** Server instant, read by the caller from IClock. Decides "today" and the not-in-the-future rule. */
  readonly now: Date;
  readonly businessTimezone: string;
  readonly businessDate: BusinessDate;
  readonly requestedOutcome: RequestedCorrectionOutcome;
  /** Null when the outcome has no clock-in. A leave outcome must pass null here, or it is refused. */
  readonly requestedCheckinAt: Date | null;
  readonly requestedCheckoutAt: Date | null;
};

export type CorrectionPolicyResult =
  | { readonly kind: 'ok' }
  | { readonly kind: 'violation'; readonly violation: CorrectionPolicyViolation };

type TimeViolationCodes = {
  readonly outsideBusinessDate: CorrectionPolicyViolation;
  readonly inFuture: CorrectionPolicyViolation;
};

const CLOCK_IN_CODES: TimeViolationCodes = {
  outsideBusinessDate: CORRECTION_POLICY_VIOLATION.CLOCK_IN_OUTSIDE_BUSINESS_DATE,
  inFuture: CORRECTION_POLICY_VIOLATION.CLOCK_IN_IN_FUTURE,
};

const CLOCK_OUT_CODES: TimeViolationCodes = {
  outsideBusinessDate: CORRECTION_POLICY_VIOLATION.CLOCK_OUT_OUTSIDE_BUSINESS_DATE,
  inFuture: CORRECTION_POLICY_VIOLATION.CLOCK_OUT_IN_FUTURE,
};

/**
 * Applies the correction submission rules (PRD COR-1, COR-2, DATABASE §5.8). A PRESENT correction needs a clock-in;
 * its clock-out is optional. Leave outcomes carry no times. The first failing rule is returned.
 *
 * The clock-out must be strictly after the clock-in. DATABASE §5.8 only checks `>=`, so this policy is the stricter
 * gate: an equal pair is refused here, and the database check does not need to match it.
 */
export function evaluateCorrectionPolicy(input: CorrectionPolicyInput): CorrectionPolicyResult {
  const violation = findCorrectionViolation(input);
  return violation === null ? { kind: 'ok' } : { kind: 'violation', violation };
}

function findCorrectionViolation(input: CorrectionPolicyInput): CorrectionPolicyViolation | null {
  const today = toBusinessDate(input.now, input.businessTimezone);
  if (
    !isWithinSubmissionWindow({
      businessDate: input.businessDate,
      today,
      windowDays: CORRECTION_SUBMISSION_WINDOW_DAYS,
    })
  ) {
    return CORRECTION_POLICY_VIOLATION.BUSINESS_DATE_OUTSIDE_WINDOW;
  }
  if (input.requestedOutcome === REQUESTED_CORRECTION_OUTCOME.PRESENT) {
    return findPresentTimesViolation(input);
  }
  return hasAnyRequestedTime(input)
    ? CORRECTION_POLICY_VIOLATION.TIMES_NOT_ALLOWED_FOR_LEAVE
    : null;
}

function findPresentTimesViolation(input: CorrectionPolicyInput): CorrectionPolicyViolation | null {
  const { requestedCheckinAt: checkinAt, requestedCheckoutAt: checkoutAt } = input;
  if (checkinAt === null) return CORRECTION_POLICY_VIOLATION.CLOCK_IN_REQUIRED;

  const checkinViolation = findTimeViolation(checkinAt, input, CLOCK_IN_CODES);
  if (checkinViolation !== null) return checkinViolation;
  if (checkoutAt === null) return null;

  const checkoutViolation = findTimeViolation(checkoutAt, input, CLOCK_OUT_CODES);
  if (checkoutViolation !== null) return checkoutViolation;
  return checkoutAt.getTime() > checkinAt.getTime()
    ? null
    : CORRECTION_POLICY_VIOLATION.CLOCK_OUT_NOT_AFTER_CLOCK_IN;
}

// COR-2: a requested time is on the business date in the business timezone and not after the server's now.
function findTimeViolation(
  instant: Date,
  input: CorrectionPolicyInput,
  codes: TimeViolationCodes,
): CorrectionPolicyViolation | null {
  if (toBusinessDate(instant, input.businessTimezone) !== input.businessDate) {
    return codes.outsideBusinessDate;
  }
  return instant.getTime() > input.now.getTime() ? codes.inFuture : null;
}

function hasAnyRequestedTime(input: CorrectionPolicyInput): boolean {
  return input.requestedCheckinAt !== null || input.requestedCheckoutAt !== null;
}
