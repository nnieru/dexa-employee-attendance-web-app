import type { OutboxTransaction } from '@dexa/messaging';
import type { AppliedCorrectionDay } from './correction-apply.rules.js';
import type { DaySchedule } from '../classification/punch-classification.rules.js';
import type { TerminalRequestStatus } from '../requests/request-decision.rules.js';
import type { StoredCorrectionRequest } from './correction-request.repository.interface.js';

export const CORRECTION_REQUEST_DECISION_REPOSITORY = Symbol(
  'ICorrectionRequestDecisionRepository',
);

/**
 * A stored correction locked for the rest of the transaction. It carries the requester for the self-review check, and
 * the day and the revision the requester saw for the stale-day check (DATABASE §5.8).
 */
export type LockedCorrectionRequest = StoredCorrectionRequest & {
  readonly requesterAccountId: string;
  readonly attendanceDayId: string;
  readonly baseRevision: number;
};

/** The day locked for an approval: its revision to check and its schedule snapshot to classify against. */
export type LockedCorrectionDay = {
  readonly dayId: string;
  readonly revision: number;
  readonly daySchedule: DaySchedule;
};

/** The decision to store. appliedRevision is set only for an approval (DATABASE §5.8). */
export type NewRequestDecision = {
  readonly requestId: string;
  readonly status: TerminalRequestStatus;
  readonly reviewerAccountId: string;
  readonly reviewedAt: Date;
  readonly reviewReason: string | null;
  readonly appliedRevision: number | null;
};

/** The reads and writes of one HR decision on a correction, inside one transaction. */
export interface ICorrectionRequestDecisionTransaction extends OutboxTransaction {
  /** Locks the request row (SELECT ... FOR UPDATE) so a concurrent decision waits for this one to commit. */
  findRequestForUpdate(requestId: string): Promise<LockedCorrectionRequest | undefined>;
  /** Locks the day row. Called only for an approval, after the request is locked. */
  findDayForUpdate(attendanceDayId: string): Promise<LockedCorrectionDay | undefined>;
  /** Stores the effective values on the locked day and increments its revision. Resolves the revision it produced. */
  applyDayValues(dayId: string, values: AppliedCorrectionDay): Promise<number>;
  /**
   * Stores the decision on a PENDING request. Rejects with RequestAlreadyDecidedError when no pending row matched, so a
   * decided request is never overwritten even if the lock were ever bypassed.
   */
  recordDecision(decision: NewRequestDecision): Promise<void>;
}

export interface ICorrectionRequestDecisionRepository {
  /**
   * Runs the work in one transaction. A DomainError raised by the work rolls the transaction back and reaches the caller
   * unchanged. Any other failure is reported without its SQL or bind values.
   */
  runInTransaction<TResult>(
    work: (transaction: ICorrectionRequestDecisionTransaction) => Promise<TResult>,
  ): Promise<TResult>;
}
