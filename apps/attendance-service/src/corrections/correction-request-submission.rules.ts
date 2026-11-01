import type { BusinessDate } from '@dexa/common';
import type { RequestedCorrectionOutcome } from './correction-policy.rules.js';

/** What a client asked for, after the contract has parsed it. The requester is the verified token's account. */
export type CorrectionSubmission = {
  readonly accountId: string;
  readonly businessDate: BusinessDate;
  readonly requestedOutcome: RequestedCorrectionOutcome;
  readonly requestedCheckinAt: Date | null;
  readonly requestedCheckoutAt: Date | null;
  readonly reason: string;
  readonly idempotencyKey: string;
};

/** The stored fields that a retry is compared with. */
export type StoredCorrectionSubmission = {
  readonly businessDate: BusinessDate;
  readonly requestedOutcome: RequestedCorrectionOutcome;
  readonly requestedCheckinAt: Date | null;
  readonly requestedCheckoutAt: Date | null;
  readonly reason: string;
};

/**
 * True when a retry asks for the same correction as the stored one, so the stored request is returned (DATABASE §5.6).
 * Instants compare as instants, so the same moment written with another offset is the same correction.
 */
export function isSameCorrectionSubmission(
  stored: StoredCorrectionSubmission,
  submission: CorrectionSubmission,
): boolean {
  return (
    stored.businessDate === submission.businessDate &&
    stored.requestedOutcome === submission.requestedOutcome &&
    isSameOptionalInstant(stored.requestedCheckinAt, submission.requestedCheckinAt) &&
    isSameOptionalInstant(stored.requestedCheckoutAt, submission.requestedCheckoutAt) &&
    stored.reason === submission.reason
  );
}

function isSameOptionalInstant(stored: Date | null, submitted: Date | null): boolean {
  if (stored === null || submitted === null) return stored === submitted;
  return stored.getTime() === submitted.getTime();
}
