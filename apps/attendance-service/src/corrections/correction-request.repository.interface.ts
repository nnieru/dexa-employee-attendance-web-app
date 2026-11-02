import type { BusinessDate } from '@dexa/common';
import type { RequestStatus } from '@dexa/contracts';
import type { OutboxTransaction } from '@dexa/messaging';
import type { AttendanceDayTransaction } from '../attendance-days/attendance-day.repository.interface.js';
import type { RequestedCorrectionOutcome } from './correction-policy.rules.js';

export const CORRECTION_REQUEST_REPOSITORY = Symbol('ICorrectionRequestRepository');

/** A stored correction request, with the business date of its day and the instants as stored. */
export type StoredCorrectionRequest = {
  readonly id: string;
  readonly businessDate: BusinessDate;
  readonly requestedOutcome: RequestedCorrectionOutcome;
  readonly requestedCheckinAt: Date | null;
  readonly requestedCheckoutAt: Date | null;
  readonly reason: string;
  readonly status: RequestStatus;
  /** The reviewer's reason. Set only when REJECTED. */
  readonly reviewReason: string | null;
  /** The decision instant, or null while PENDING. */
  readonly reviewedAt: Date | null;
  readonly createdAt: Date;
};

/**
 * The day as it stands when the correction is submitted: the revision HR will check against, the
 * effective times, and the day status. Read under the day's row lock, so it is the value the employee saw.
 */
export type DayRevisionSnapshot = {
  readonly revision: number;
  readonly effectiveCheckinAt: Date | null;
  readonly effectiveCheckoutAt: Date | null;
  readonly dayStatusId: string;
};

/** The row to insert. The day is the employee's day for the business date, locked by the caller. */
export type NewCorrectionRequest = {
  readonly attendanceDayId: string;
  readonly accountId: string;
  readonly businessDate: BusinessDate;
  readonly requestedOutcome: RequestedCorrectionOutcome;
  readonly requestedCheckinAt: Date | null;
  readonly requestedCheckoutAt: Date | null;
  readonly reason: string;
  readonly idempotencyKey: string;
  readonly beforeDay: DayRevisionSnapshot;
};

/**
 * The reads and writes that one correction submission needs, inside one transaction. The day is found or created, and
 * locked, by the shared day creation, the same way as for a punch and an overtime request.
 */
export interface ICorrectionRequestTransaction extends AttendanceDayTransaction, OutboxTransaction {
  /** The employee's request with this key, or undefined. The key is unique per requester. */
  findRequestByIdempotencyKey(
    accountId: string,
    idempotencyKey: string,
  ): Promise<StoredCorrectionRequest | undefined>;
  /** True when the day has a PENDING correction. Read after the day is locked, so a concurrent submission has committed. */
  hasPendingCorrection(attendanceDayId: string): Promise<boolean>;
  /** Reads the locked day's revision, effective times, and status. The day must already exist in this transaction. */
  findDayRevisionSnapshot(attendanceDayId: string): Promise<DayRevisionSnapshot>;
  /**
   * Inserts a pending correction. Rejects with CorrectionAlreadyPendingError when the day already has one, and with
   * CorrectionIdempotencyKeyRaceError when the requester's key is already stored.
   */
  insertCorrectionRequest(request: NewCorrectionRequest): Promise<StoredCorrectionRequest>;
}

export interface ICorrectionRequestRepository {
  /**
   * Runs the work in one transaction. A DomainError or CorrectionIdempotencyKeyRaceError raised by the work rolls the
   * transaction back and reaches the caller unchanged. Any other failure is reported without its SQL or bind values.
   */
  runInTransaction<TResult>(
    work: (transaction: ICorrectionRequestTransaction) => Promise<TResult>,
  ): Promise<TResult>;
}
