import type { BusinessDate } from '@dexa/common';
import type { RequestStatus } from '@dexa/contracts';
import type { OutboxTransaction } from '@dexa/messaging';
import type { AttendanceDayTransaction } from '../attendance-days/attendance-day.repository.interface.js';

export const OVERTIME_REQUEST_REPOSITORY = Symbol('IOvertimeRequestRepository');

/** A stored overtime request, with the business date of its day and the instants as stored. */
export type StoredOvertimeRequest = {
  readonly id: string;
  readonly businessDate: BusinessDate;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly reason: string;
  readonly status: RequestStatus;
  /** The reviewer's reason. Set only when REJECTED. */
  readonly reviewReason: string | null;
  /** The decision instant, or null while PENDING. */
  readonly reviewedAt: Date | null;
  readonly createdAt: Date;
};

/** The row to insert. The day is the employee's day for the business date, locked by the caller. */
export type NewOvertimeRequest = {
  readonly attendanceDayId: string;
  readonly accountId: string;
  readonly businessDate: BusinessDate;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly reason: string;
  readonly idempotencyKey: string;
};

/**
 * The reads and writes that one overtime submission needs, inside one transaction. The day reads come from the
 * shared day creation, so the day is found or created, and locked, the same way as for a punch.
 */
export interface IOvertimeRequestTransaction extends AttendanceDayTransaction, OutboxTransaction {
  /** The employee's request with this key, or undefined. The key is unique per requester. */
  findRequestByIdempotencyKey(
    accountId: string,
    idempotencyKey: string,
  ): Promise<StoredOvertimeRequest | undefined>;
  /**
   * Total minutes of the day's pending and approved overtime. The database sums it after the day is locked, so a
   * concurrent submission for the same day has already committed when this runs.
   */
  findActiveOvertimeMinutes(attendanceDayId: string): Promise<number>;
  /**
   * Inserts a pending request. Rejects with OvertimeOverlapError on an overlap, and with
   * OvertimeIdempotencyKeyRaceError when the requester's key is already stored.
   */
  insertOvertimeRequest(request: NewOvertimeRequest): Promise<StoredOvertimeRequest>;
}

export interface IOvertimeRequestRepository {
  /**
   * Runs the work in one transaction. A DomainError or OvertimeIdempotencyKeyRaceError raised by the work rolls the
   * transaction back and reaches the caller unchanged. Any other failure is reported without its SQL or bind values.
   */
  runInTransaction<TResult>(
    work: (transaction: IOvertimeRequestTransaction) => Promise<TResult>,
  ): Promise<TResult>;
}
