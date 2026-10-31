import { sql } from 'drizzle-orm';
import {
  check,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// One HR inbox row per source event per HR recipient (DATABASE §7.1). Recipient, subject, actor, and event IDs
// are logical references to other services, so none of them is a foreign key.
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').notNull().defaultRandom(),
    eventId: uuid('event_id').notNull(),
    eventType: varchar('event_type', { length: 80 }).notNull(),
    recipientAccountId: uuid('recipient_account_id').notNull(),
    subjectAccountId: uuid('subject_account_id').notNull(),
    actorAccountId: uuid('actor_account_id').notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    body: text('body').notNull(),
    data: jsonb('data').$type<Readonly<Record<string, unknown>>>().notNull().default({}),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (table) => [
    primaryKey({ name: 'notifications_id_pk', columns: [table.id] }),
    // A redelivered event must not create a second row for the same recipient.
    unique('notifications_event_id_recipient_account_id_uq').on(
      table.eventId,
      table.recipientAccountId,
    ),
    check('notifications_data_ck', sql`jsonb_typeof(${table.data}) = 'object'`),
    // The first read time is kept, and a read cannot precede the row it marks.
    check(
      'notifications_read_at_created_at_ck',
      sql`${table.readAt} is null or ${table.readAt} >= ${table.createdAt}`,
    ),
    // Explicit NULLS FIRST is PostgreSQL's default for DESC, so the index matches ORDER BY created_at DESC, id DESC.
    index('notifications_recipient_account_id_created_at_id_idx').on(
      table.recipientAccountId,
      table.createdAt.desc().nullsFirst(),
      table.id.desc().nullsFirst(),
    ),
    index('notifications_recipient_account_id_created_at_id_unread_idx')
      .on(
        table.recipientAccountId,
        table.createdAt.desc().nullsFirst(),
        table.id.desc().nullsFirst(),
      )
      .where(sql`${table.readAt} is null`),
  ],
);
