import type { TerminalRequestStatus } from '../requests/request-decision.rules.js';
import type { StoredOvertimeRequest } from './overtime-request.repository.interface.js';

export const OVERTIME_REQUEST_DECISION_REPOSITORY = Symbol('IOvertimeRequestDecisionRepository');

/** A stored overtime request locked for the rest of the transaction, with its requester for the self-review check. */
export type LockedOvertimeRequest = StoredOvertimeRequest & {
  readonly requesterAccountId: string;
};

/** The decision to store. reviewReason is null for an approval without a reason. */
export type NewRequestDecision = {
  readonly requestId: string;
  readonly status: TerminalRequestStatus;
  readonly reviewerAccountId: string;
  readonly reviewedAt: Date;
  readonly reviewReason: string | null;
};

/** The reads and writes of one HR decision, inside one transaction. */
export interface IOvertimeRequestDecisionTransaction {
  /** Locks the request row (SELECT ... FOR UPDATE) so a concurrent decision waits for this one to commit. */
  findRequestForUpdate(requestId: string): Promise<LockedOvertimeRequest | undefined>;
  /**
   * Stores the decision on a PENDING request. Rejects with RequestAlreadyDecidedError when no pending row matched, so a
   * decided request is never overwritten even if the lock were ever bypassed.
   */
  recordDecision(decision: NewRequestDecision): Promise<void>;
}

export interface IOvertimeRequestDecisionRepository {
  /**
   * Runs the work in one transaction. A DomainError raised by the work rolls the transaction back and reaches the caller
   * unchanged. Any other failure is reported without its SQL or bind values.
   */
  runInTransaction<TResult>(
    work: (transaction: IOvertimeRequestDecisionTransaction) => Promise<TResult>,
  ): Promise<TResult>;
}
