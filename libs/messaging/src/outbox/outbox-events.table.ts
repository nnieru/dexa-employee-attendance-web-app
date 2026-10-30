import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import type { EventMessage } from '../event-message.js';

// Every publishing service re-exports this table from its own schema.ts. That makes its drizzle-kit generate
// write the outbox migration into the service's own migrations folder, in the service's own database.
export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').notNull(),
    eventType: varchar('event_type', { length: 80 }).notNull(),
    payload: jsonb('payload').$type<EventMessage>().notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    attemptCount: integer('attempt_count').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    lastError: text('last_error'),
  },
  (table) => [
    primaryKey({ name: 'outbox_events_id_pk', columns: [table.id] }),
    check('outbox_events_payload_ck', sql`jsonb_typeof(${table.payload}) = 'object'`),
    check('outbox_events_attempt_count_ck', sql`${table.attemptCount} >= 0`),
    // The relay's claim reads only unpublished rows, so the index covers just those.
    index('outbox_events_next_attempt_at_created_at_idx')
      .on(table.nextAttemptAt, table.createdAt)
      .where(sql`${table.publishedAt} is null`),
  ],
);
