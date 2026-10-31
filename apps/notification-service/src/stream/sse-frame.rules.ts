import {
  NOTIFICATION_STREAM_EVENT_NAME,
  notificationSchema,
  type Notification,
} from '@dexa/contracts';
import type { InsertedNotification } from '../ingestion/notification-writer.interface.js';

/** A comment frame. EventSource clients ignore it, and it keeps the connection busy for proxies. */
export const HEARTBEAT_FRAME = ': heartbeat\n\n';

/**
 * One server-sent event named `notification`, whose data is the notification as JSON on a single line. JSON.stringify
 * never emits a raw line break, so one data line is enough.
 */
export function formatNotificationFrame(notification: InsertedNotification): string {
  const payload = JSON.stringify(toNotification(notification));
  return `event: ${NOTIFICATION_STREAM_EVENT_NAME}\ndata: ${payload}\n\n`;
}

// The row is checked against the contract before it leaves the service. A row that does not match is a defect, so
// the parse throws and nothing reaches the browser. The error is never logged with its values.
function toNotification(row: InsertedNotification): Notification {
  return notificationSchema.parse({
    id: row.id,
    eventType: row.eventType,
    title: row.title,
    body: row.body,
    data: row.data,
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
  });
}
