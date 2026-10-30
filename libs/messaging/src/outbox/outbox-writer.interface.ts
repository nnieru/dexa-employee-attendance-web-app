import type { EventMessage } from '../event-message.js';
import type { outboxEvents } from './outbox-events.table.js';

/**
 * The one Drizzle capability the writer uses. A transaction from `db.transaction` provides it, so the
 * outbox row joins the caller's business writes in the same transaction.
 */
export type OutboxTransaction = {
  insert(table: typeof outboxEvents): {
    values(row: typeof outboxEvents.$inferInsert): PromiseLike<unknown>;
  };
};

export interface IOutboxWriter {
  /**
   * Stages the event inside the caller's transaction, so it is stored only if the business change commits.
   * Rejects an event that is not an event envelope before anything is inserted.
   */
  add(transaction: OutboxTransaction, event: EventMessage): Promise<void>;
}

export const OUTBOX_WRITER = Symbol('IOutboxWriter');
