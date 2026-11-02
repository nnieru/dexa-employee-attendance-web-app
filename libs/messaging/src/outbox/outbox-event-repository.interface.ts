/** One outbox row as the relay reads it. `payload` is the stored envelope, validated again before publishing. */
export type OutboxEventRecord = {
  readonly id: string;
  readonly eventType: string;
  readonly payload: unknown;
  readonly attemptCount: number;
};

export type ClaimDueEventsInput = {
  readonly now: Date;
  /** The claim lease: until this instant no other relay may claim the event (one publish timeout plus slack). */
  readonly leaseMilliseconds: number;
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

export type ReleaseLeaseInput = {
  readonly id: string;
  /** The instant the event is due again. Because nothing was sent, this can be immediately. */
  readonly nextAttemptAt: Date;
};

/**
 * Reads and writes one outbox event at a time, in one short transaction that claims, leases, publishes, and
 * settles the event. The row lock and the pool connection are held for at most one publish timeout, so a
 * degraded broker never freezes the owning database (ARCHITECTURE §17 review). Other relays are kept out by
 * the lease, not by a long lock: a leased event is not due, so it cannot be claimed again, and the claim
 * query refuses to hand out a later event while an earlier unpublished one is not due.
 */
export interface IOutboxEventRepository {
  /**
   * Claims the one event that is due, pushes its retry deadline by the lease, and returns it with the
   * attempt count as it was. Resolves undefined when no event is claimable.
   */
  claimDueEvent(input: ClaimDueEventsInput): Promise<OutboxEventRecord | undefined>;
  markEventPublished(input: MarkEventPublishedInput): Promise<void>;
  recordFailedAttempt(input: RecordFailedAttemptInput): Promise<void>;
  /** Cancels the lease of an event whose publish never started, without counting an attempt. */
  releaseEventLease(input: ReleaseLeaseInput): Promise<void>;
  /** Deletes up to `limit` published events published before `cutoff`, and returns how many it deleted. */
  deletePublishedBefore(input: { readonly cutoff: Date; readonly limit: number }): Promise<number>;
}

export const OUTBOX_EVENT_REPOSITORY = Symbol('IOutboxEventRepository');
