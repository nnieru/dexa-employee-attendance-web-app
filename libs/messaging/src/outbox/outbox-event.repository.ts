import type { Database } from '@dexa/db';
import { and, asc, eq, gt, inArray, isNotNull, isNull, lt, lte, ne, notExists } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { alias } from 'drizzle-orm/pg-core';
import type {
  ClaimDueEventsInput,
  IOutboxEventRepository,
  IOutboxPassTransaction,
  MarkEventPublishedInput,
  OutboxEventRecord,
  RecordFailedAttemptInput,
} from './outbox-event-repository.interface.js';
import { outboxEvents } from './outbox-events.table.js';

// A pass needs only select and update, which both the pool and a transaction provide.
type OutboxSqlClient = Pick<NodePgDatabase, 'select' | 'update'>;

export class OutboxEventRepository implements IOutboxEventRepository {
  constructor(private readonly database: Pick<Database, 'db'>) {}

  async runPassTransaction(
    work: (transaction: IOutboxPassTransaction) => Promise<void>,
  ): Promise<void> {
    await this.database.db.transaction(async (transaction) => {
      await work(new DrizzleOutboxPassTransaction(transaction));
    });
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

class DrizzleOutboxPassTransaction implements IOutboxPassTransaction {
  constructor(private readonly client: OutboxSqlClient) {}

  async claimDueEvents(input: ClaimDueEventsInput): Promise<ReadonlyArray<OutboxEventRecord>> {
    // An earlier unpublished event that is backing off blocks every later event. Without this, a retry
    // could publish events written after it while it waits, which breaks creation order after an outage.
    const earlierEvent = alias(outboxEvents, 'earlier_event');
    return this.client
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
            this.client
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
      .orderBy(asc(outboxEvents.createdAt))
      .limit(input.limit)
      .for('update', { skipLocked: true });
  }

  async markEventPublished(input: MarkEventPublishedInput): Promise<void> {
    await this.client
      .update(outboxEvents)
      .set({ publishedAt: input.publishedAt })
      .where(eq(outboxEvents.id, input.id));
  }

  async recordFailedAttempt(input: RecordFailedAttemptInput): Promise<void> {
    await this.client
      .update(outboxEvents)
      .set({
        attemptCount: input.attemptCount,
        nextAttemptAt: input.nextAttemptAt,
        lastError: input.lastError,
      })
      .where(eq(outboxEvents.id, input.id));
  }
}
