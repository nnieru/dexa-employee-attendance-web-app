import type { Database } from '@dexa/db';
import { and, asc, eq, gt, inArray, isNotNull, isNull, lt, lte, ne, notExists } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type {
  ClaimDueEventsInput,
  IOutboxEventRepository,
  MarkEventPublishedInput,
  OutboxEventRecord,
  RecordFailedAttemptInput,
  ReleaseLeaseInput,
} from './outbox-event-repository.interface.js';
import { outboxEvents } from './outbox-events.table.js';

export class OutboxEventRepository implements IOutboxEventRepository {
  constructor(private readonly database: Pick<Database, 'db'>) {}

  async claimDueEvent(input: ClaimDueEventsInput): Promise<OutboxEventRecord | undefined> {
    // The read, the lease, the publish, and the settle are all inside this one short transaction. The
    // lease (a later nextAttemptAt) is what keeps other relays and later passes away from an event that
    // is being published right now, so a row lock never has to outlive this transaction.
    return this.database.db.transaction(async (transaction) => {
      // An earlier unpublished event that is backing off (or leased for its publish) blocks every later
      // event. Without this, a retry could publish an event written after it while it waits, which
      // breaks creation order after an outage.
      const earlierEvent = alias(outboxEvents, 'earlier_event');
      const [claimed] = await transaction
        .select({
          id: outboxEvents.id,
          eventType: outboxEvents.eventType,
          payload: outboxEvents.payload,
          attemptCount: outboxEvents.attemptCount,
        })
        .from(outboxEvents)
        .where(
          and(
            isNull(outboxEvents.publishedAt),
            lte(outboxEvents.nextAttemptAt, input.now),
            notExists(
              transaction
                .select({ id: earlierEvent.id })
                .from(earlierEvent)
                .where(
                  and(
                    isNull(earlierEvent.publishedAt),
                    gt(earlierEvent.nextAttemptAt, input.now),
                    lte(earlierEvent.createdAt, outboxEvents.createdAt),
                    ne(earlierEvent.id, outboxEvents.id),
                  ),
                ),
            ),
          ),
        )
        // The tie-break by id keeps a deterministic order for rows that one transaction wrote together,
        // which share a transaction timestamp.
        .orderBy(asc(outboxEvents.createdAt), asc(outboxEvents.id))
        .limit(1)
        .for('update', { skipLocked: true });
      if (claimed === undefined) return undefined;
      await transaction
        .update(outboxEvents)
        .set({
          nextAttemptAt: new Date(input.now.getTime() + input.leaseMilliseconds),
        })
        .where(eq(outboxEvents.id, claimed.id));
      return claimed;
    });
  }

  async markEventPublished(input: MarkEventPublishedInput): Promise<void> {
    await this.database.db
      .update(outboxEvents)
      .set({ publishedAt: input.publishedAt })
      .where(eq(outboxEvents.id, input.id));
  }

  async recordFailedAttempt(input: RecordFailedAttemptInput): Promise<void> {
    await this.database.db
      .update(outboxEvents)
      .set({
        attemptCount: input.attemptCount,
        nextAttemptAt: input.nextAttemptAt,
        lastError: input.lastError,
      })
      .where(eq(outboxEvents.id, input.id));
  }

  async releaseEventLease(input: ReleaseLeaseInput): Promise<void> {
    await this.database.db
      .update(outboxEvents)
      .set({ nextAttemptAt: input.nextAttemptAt })
      .where(eq(outboxEvents.id, input.id));
  }

  async deletePublishedBefore(input: {
    readonly cutoff: Date;
    readonly limit: number;
  }): Promise<number> {
    // The subquery selects a bounded batch, so each statement deletes a small, fixed number of rows.
    const expiredIds = this.database.db
      .select({ id: outboxEvents.id })
      .from(outboxEvents)
      .where(and(isNotNull(outboxEvents.publishedAt), lt(outboxEvents.publishedAt, input.cutoff)))
      .orderBy(asc(outboxEvents.publishedAt))
      .limit(input.limit);
    const deleted = await this.database.db
      .delete(outboxEvents)
      .where(inArray(outboxEvents.id, expiredIds))
      .returning({ id: outboxEvents.id });
    return deleted.length;
  }
}
