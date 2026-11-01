import type { BusinessDate } from '@dexa/common';

/** What a client asked for, after the contract has parsed it. The requester is the verified token's account. */
export type OvertimeSubmission = {
  readonly accountId: string;
  readonly businessDate: BusinessDate;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly reason: string;
  readonly idempotencyKey: string;
};

/** The stored fields that a retry is compared with. */
export type StoredOvertimeSubmission = {
  readonly businessDate: BusinessDate;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly reason: string;
};

/**
 * True when a retry asks for the same request as the stored one, so the stored request is returned (DATABASE §5.6).
 * The instants compare as instants, so the same moment written with another offset is the same request.
 */
export function isSameOvertimeSubmission(
  stored: StoredOvertimeSubmission,
  submission: OvertimeSubmission,
): boolean {
  return (
    stored.businessDate === submission.businessDate &&
    stored.startAt.getTime() === submission.startAt.getTime() &&
    stored.endAt.getTime() === submission.endAt.getTime() &&
    stored.reason === submission.reason
  );
}
