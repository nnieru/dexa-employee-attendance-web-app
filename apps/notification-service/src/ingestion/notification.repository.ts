import type { Database } from '@dexa/db';
import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../infrastructure/db/database.token.js';
import { notifications } from '../infrastructure/db/schema.js';
import type { NotificationDraft } from './notification-row.rules.js';
import type { InsertedNotification, INotificationWriter } from './notification-writer.interface.js';

type NotificationRecord = typeof notifications.$inferSelect;

@Injectable()
export class NotificationRepository implements INotificationWriter {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  // The conflict target is the unique (event_id, recipient_account_id) of DATABASE §7.1. A redelivered event hits
  // the conflict and inserts nothing, and an existing row keeps its read state. RETURNING lists only the rows that
  // were inserted, so a no-op never reaches the live stream. The transaction resolves after COMMIT.
  async insertForRecipients(
    drafts: ReadonlyArray<NotificationDraft>,
  ): Promise<ReadonlyArray<InsertedNotification>> {
    return this.database.db.transaction(async (transaction) => {
      const rows = await transaction
        .insert(notifications)
        .values(drafts.map(toNotificationInsert))
        .onConflictDoNothing({
          target: [notifications.eventId, notifications.recipientAccountId],
        })
        .returning();
      return rows.map(toInsertedNotification);
    });
  }
}

// Explicit field mapping, so a draft never reaches the table by spreading its keys.
function toNotificationInsert(draft: NotificationDraft): typeof notifications.$inferInsert {
  return {
    eventId: draft.eventId,
    eventType: draft.eventType,
    recipientAccountId: draft.recipientAccountId,
    subjectAccountId: draft.subjectAccountId,
    actorAccountId: draft.actorAccountId,
    title: draft.title,
    body: draft.body,
    data: draft.data,
    occurredAt: draft.occurredAt,
    createdAt: draft.createdAt,
  };
}

// Explicit field mapping, so only the fields the live stream needs leave the repository.
function toInsertedNotification(record: NotificationRecord): InsertedNotification {
  return {
    id: record.id,
    eventType: record.eventType,
    recipientAccountId: record.recipientAccountId,
    title: record.title,
    body: record.body,
    data: record.data,
    occurredAt: record.occurredAt,
    createdAt: record.createdAt,
    readAt: record.readAt,
  };
}
