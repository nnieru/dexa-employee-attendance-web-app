import { sql } from 'drizzle-orm';
import {
  check,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// Raw message bodies are kept as bytes so non-JSON input can be archived and replayed.
// drizzle-orm/pg-core has no built-in bytea column.
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

// Field names only, never before/after values.
export const auditLogs = pgTable(
  'audit_logs',
  {
    eventId: uuid('event_id').notNull(),
    eventType: varchar('event_type', { length: 80 }).notNull(),
    resourceType: varchar('resource_type', { length: 50 }),
    resourceId: uuid('resource_id'),
    sourceService: varchar('source_service', { length: 40 }).notNull(),
    accountId: uuid('account_id').notNull(),
    actorAccountId: uuid('actor_account_id').notNull(),
    changedFields: jsonb('changed_fields').$type<ReadonlyArray<string>>().notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ name: 'audit_logs_event_id_pk', columns: [table.eventId] }),
    // Supported event types are checked by the consumer, not here, so a new event type needs no migration.
    check('audit_logs_changed_fields_ck', sql`jsonb_typeof(${table.changedFields}) = 'array'`),
    check(
      'audit_logs_resource_type_resource_id_ck',
      sql`(${table.resourceType} is null) = (${table.resourceId} is null)`,
    ),
    index('audit_logs_account_id_occurred_at_idx').on(table.accountId, table.occurredAt),
    index('audit_logs_resource_type_resource_id_occurred_at_idx').on(
      table.resourceType,
      table.resourceId,
      table.occurredAt,
    ),
  ],
);

// Failed audit messages awaiting or recording replay. No foreign key to audit_logs: a failed
// event may not have an audit row yet.
export const dlqMessages = pgTable(
  'dlq_messages',
  {
    id: uuid('id').notNull().defaultRandom(),
    messageId: varchar('message_id', { length: 255 }).notNull(),
    eventId: uuid('event_id'),
    sourceQueue: varchar('source_queue', { length: 255 }).notNull(),
    payload: bytea('payload').notNull(),
    headers: jsonb('headers').$type<Readonly<Record<string, unknown>>>().notNull().default({}),
    attemptCount: integer('attempt_count').notNull(),
    lastError: text('last_error').notNull(),
    status: varchar('status', { length: 20 })
      .$type<'PENDING' | 'REQUEUED' | 'RESOLVED'>()
      .notNull()
      .default('PENDING'),
    firstFailedAt: timestamp('first_failed_at', { withTimezone: true }).notNull(),
    lastFailedAt: timestamp('last_failed_at', { withTimezone: true }).notNull(),
    requeuedAt: timestamp('requeued_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [
    primaryKey({ name: 'dlq_messages_id_pk', columns: [table.id] }),
    unique('dlq_messages_source_queue_message_id_uq').on(table.sourceQueue, table.messageId),
    check('dlq_messages_attempt_count_ck', sql`${table.attemptCount} >= 1`),
    check('dlq_messages_status_ck', sql`${table.status} in ('PENDING', 'REQUEUED', 'RESOLVED')`),
    check(
      'dlq_messages_last_failed_at_first_failed_at_ck',
      sql`${table.lastFailedAt} >= ${table.firstFailedAt}`,
    ),
    // Only a RESOLVED row carries a resolution time, and every RESOLVED row carries one.
    check(
      'dlq_messages_resolved_at_status_ck',
      sql`(${table.status} = 'RESOLVED') = (${table.resolvedAt} is not null)`,
    ),
    index('dlq_messages_status_last_failed_at_idx').on(table.status, table.lastFailedAt),
    index('dlq_messages_event_id_idx').on(table.eventId),
  ],
);
