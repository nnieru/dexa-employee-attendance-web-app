import {
  classifyCheckIn,
  classifyCheckOut,
  type CheckInStatusCode,
  type CheckOutStatusCode,
  type DaySchedule,
} from '../classification/punch-classification.rules.js';
import {
  REQUESTED_CORRECTION_OUTCOME,
  type RequestedCorrectionOutcome,
} from './correction-policy.rules.js';

/** A PRESENT day with no check-out yet on a working day. */
export type AppliedCheckOutStatusCode = CheckOutStatusCode | 'PENDING_CHECKOUT';

/** The request fields and the day snapshot that an approval applies. The times are the complete proposed values. */
export type CorrectionApplyInput = {
  readonly daySchedule: DaySchedule;
  readonly requestedOutcome: RequestedCorrectionOutcome;
  readonly requestedCheckinAt: Date | null;
  readonly requestedCheckoutAt: Date | null;
};

/** The effective values an approved correction stores on the day. */
export type AppliedCorrectionDay = {
  readonly dayStatusCode: RequestedCorrectionOutcome;
  readonly effectiveCheckinAt: Date | null;
  readonly effectiveCheckoutAt: Date | null;
  readonly checkinStatusCode: CheckInStatusCode;
  readonly checkoutStatusCode: AppliedCheckOutStatusCode;
};

/**
 * Computes the effective day that an approved correction produces. PRESENT reclassifies both times against the day's
 * schedule snapshot. A leave outcome clears the times and sets the not-required timing statuses. Raw punches are not an
 * input: they are never changed by a correction.
 */
export function applyCorrectionToDay(input: CorrectionApplyInput): AppliedCorrectionDay {
  if (input.requestedOutcome === REQUESTED_CORRECTION_OUTCOME.PRESENT) {
    return applyPresentCorrection(input);
  }
  return applyLeaveCorrection(input.requestedOutcome);
}

// Submission requires a clock-in for PRESENT, so a missing one here means the stored request is broken.
function applyPresentCorrection(input: CorrectionApplyInput): AppliedCorrectionDay {
  const { daySchedule, requestedCheckinAt, requestedCheckoutAt } = input;
  if (requestedCheckinAt === null) {
    throw new RangeError('A present correction needs a clock-in time.');
  }
  return {
    dayStatusCode: REQUESTED_CORRECTION_OUTCOME.PRESENT,
    effectiveCheckinAt: requestedCheckinAt,
    effectiveCheckoutAt: requestedCheckoutAt,
    checkinStatusCode: classifyCheckIn(requestedCheckinAt, daySchedule),
    checkoutStatusCode: classifyPresentCheckOut(requestedCheckoutAt, daySchedule),
  };
}

function classifyPresentCheckOut(
  checkoutAt: Date | null,
  daySchedule: DaySchedule,
): AppliedCheckOutStatusCode {
  if (checkoutAt !== null) return classifyCheckOut(checkoutAt, daySchedule);
  return daySchedule.isWorkingDay ? 'PENDING_CHECKOUT' : 'CHECKOUT_NOT_REQUIRED';
}

// A leave day has no effective punches, so both timing statuses are not required.
function applyLeaveCorrection(
  outcome: Exclude<RequestedCorrectionOutcome, 'PRESENT'>,
): AppliedCorrectionDay {
  return {
    dayStatusCode: outcome,
    effectiveCheckinAt: null,
    effectiveCheckoutAt: null,
    checkinStatusCode: 'CHECKIN_NOT_REQUIRED',
    checkoutStatusCode: 'CHECKOUT_NOT_REQUIRED',
  };
}
