import { notificationSchema, type Notification, type NotificationPage } from '@dexa/contracts';
import { encodeInboxCursor } from './notification-inbox-cursor.rules.js';
import type { NotificationInboxRecord } from './notification-inbox.repository.interface.js';

/**
 * Maps one row to the contract. The parse makes a row that does not match the contract a defect that stops the
 * response, rather than a payload the browser cannot read. The parse error names no value.
 */
export function toNotificationItem(record: NotificationInboxRecord): Notification {
  return notificationSchema.parse({
    id: record.id,
    eventType: record.eventType,
    title: record.title,
    body: record.body,
    data: record.data,
    occurredAt: record.occurredAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    readAt: record.readAt?.toISOString() ?? null,
  });
}

/**
 * Builds one page from rows read with one extra row. The extra row only signals that a next page exists, so it is
 * dropped, and the cursor names the last row that stays on this page.
 */
export function toNotificationPage(
  records: ReadonlyArray<NotificationInboxRecord>,
  limit: number,
): NotificationPage {
  const hasNextPage = records.length > limit;
  const pageRecords = records.slice(0, limit);
  const lastRecord = pageRecords.at(-1);
  return {
    items: pageRecords.map(toNotificationItem),
    nextCursor: hasNextPage && lastRecord !== undefined ? encodeInboxCursor(lastRecord) : null,
  };
}
