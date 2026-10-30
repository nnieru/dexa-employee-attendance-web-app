/** One outbox row as the relay reads it. `payload` is the stored envelope, validated again before publishing. */
export type OutboxEventRecord = {
  readonly id: string;
  readonly eventType: string;
  readonly payload: unknown;
  readonly attemptCount: number;
};

export type ClaimDueEventsInput = {
  readonly now: Date;
  readonly limit: number;
};

export type MarkEventPublishedInput = {
  readonly id: string;
  readonly publishedAt: Date;
};

export type RecordFailedAttemptInput = {
  readonly id: string;
  readonly attemptCount: number;
  readonly nextAttemptAt: Date;
  readonly lastError: string;
};

/** What one relay pass does inside its transaction. Every call commits or rolls back with the pass. */
export interface IOutboxPassTransaction {
  /**
   * Locks up to `limit` events that are due, oldest first. An event is not due while an earlier unpublished
   * event is still backing off, so a later event never overtakes one that has failed.
   */
  claimDueEvents(input: ClaimDueEventsInput): Promise<ReadonlyArray<OutboxEventRecord>>;
  markEventPublished(input: MarkEventPublishedInput): Promise<void>;
  recordFailedAttempt(input: RecordFailedAttemptInput): Promise<void>;
}

export interface IOutboxEventRepository {
  runPassTransaction(work: (transaction: IOutboxPassTransaction) => Promise<void>): Promise<void>;
  /** Deletes up to `limit` published events published before `cutoff`, and returns how many it deleted. */
  deletePublishedBefore(input: { readonly cutoff: Date; readonly limit: number }): Promise<number>;
}

export const OUTBOX_EVENT_REPOSITORY = Symbol('IOutboxEventRepository');
