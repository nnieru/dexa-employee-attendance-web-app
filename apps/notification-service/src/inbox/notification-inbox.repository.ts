import type { Database } from '@dexa/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, isNull, lt, or, type SQL } from 'drizzle-orm';
import { DATABASE } from '../infrastructure/db/database.token.js';
import { notifications } from '../infrastructure/db/schema.js';
import type { InboxCursor } from './notification-inbox-cursor.rules.js';
import type {
  INotificationInboxRepository,
  MarkNotificationReadCriteria,
  NotificationInboxRecord,
  NotificationPageCriteria,
} from './notification-inbox.repository.interface.js';

type NotificationRow = typeof notifications.$inferSelect;

// The columns the inbox returns. Recipient, subject, actor, and event IDs stay in the table.
const inboxColumns = {
  id: notifications.id,
  eventType: notifications.eventType,
  title: notifications.title,
  body: notifications.body,
  data: notifications.data,
  occurredAt: notifications.occurredAt,
  createdAt: notifications.createdAt,
  readAt: notifications.readAt,
} as const;

// Each query filters by the recipient, so a row of another HR account is never read or changed here.
@Injectable()
export class NotificationInboxRepository implements INotificationInboxRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  // The ORDER BY matches the history index (recipient, created_at DESC, id DESC), so a page is one index range.
  async findPage(criteria: NotificationPageCriteria): Promise<NotificationInboxRecord[]> {
    const rows = await this.database.db
      .select(inboxColumns)
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientAccountId, criteria.recipientAccountId),
          afterCursor(criteria.after),
        ),
      )
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(criteria.limit);
    return rows.map(toNotificationInboxRecord);
  }

  // The predicate repeats the partial unread index's condition (read_at IS NULL), so the count reads only that index.
  async countUnread(recipientAccountId: string): Promise<number> {
    const [result] = await this.database.db
      .select({ total: count() })
      .from(notifications)
      .where(
        and(eq(notifications.recipientAccountId, recipientAccountId), isNull(notifications.readAt)),
      );
    return result?.total ?? 0;
  }

  // The update and the read run in one transaction, so the row returned is the row this request saw marked. An
  // already-read row matches no update and keeps its first read_at.
  async markRead(
    criteria: MarkNotificationReadCriteria,
  ): Promise<NotificationInboxRecord | undefined> {
    return this.database.db.transaction(async (transaction) => {
      await transaction
        .update(notifications)
        .set({ readAt: criteria.readAt })
        .where(
          and(
            eq(notifications.id, criteria.notificationId),
            eq(notifications.recipientAccountId, criteria.recipientAccountId),
            isNull(notifications.readAt),
          ),
        );
      const [row] = await transaction
        .select(inboxColumns)
        .from(notifications)
        .where(
          and(
            eq(notifications.id, criteria.notificationId),
            eq(notifications.recipientAccountId, criteria.recipientAccountId),
          ),
        )
        .limit(1);
      return row === undefined ? undefined : toNotificationInboxRecord(row);
    });
  }
}

// Strictly after the cursor's row in the descending order: an earlier created_at, or the same created_at with a
// smaller id.
function afterCursor(after: InboxCursor | undefined): SQL | undefined {
  if (after === undefined) return undefined;
  return or(
    lt(notifications.createdAt, after.createdAt),
    and(eq(notifications.createdAt, after.createdAt), lt(notifications.id, after.id)),
  );
}

// Explicit field mapping, so the rest of the row never leaves the repository.
function toNotificationInboxRecord(
  row: Pick<NotificationRow, keyof typeof inboxColumns>,
): NotificationInboxRecord {
  return {
    id: row.id,
    eventType: row.eventType,
    title: row.title,
    body: row.body,
    data: row.data,
    occurredAt: row.occurredAt,
    createdAt: row.createdAt,
    readAt: row.readAt,
  };
}
