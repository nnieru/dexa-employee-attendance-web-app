import type { InboxCursor } from './notification-inbox-cursor.rules.js';

/** One inbox row as the service reads it. Explicit fields, so no column reaches the response by accident. */
export type NotificationInboxRecord = {
  readonly id: string;
  readonly eventType: string;
  readonly title: string;
  readonly body: string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly occurredAt: Date;
  readonly createdAt: Date;
  readonly readAt: Date | null;
};

export type NotificationPageCriteria = {
  readonly recipientAccountId: string;
  // Undefined for the first page.
  readonly after: InboxCursor | undefined;
  readonly limit: number;
};

export type MarkNotificationReadCriteria = {
  readonly recipientAccountId: string;
  readonly notificationId: string;
  readonly readAt: Date;
};

export interface INotificationInboxRepository {
  /** Rows of one recipient, newest first, after the cursor. The caller asks for one row more than a page to learn whether another page exists. */
  findPage(criteria: NotificationPageCriteria): Promise<ReadonlyArray<NotificationInboxRecord>>;
  countUnread(recipientAccountId: string): Promise<number>;
  /**
   * Sets read_at only on a row of this recipient that is still unread, then returns the row. A row already read keeps
   * its first read_at. Resolves undefined when no row of this recipient has the ID.
   */
  markRead(criteria: MarkNotificationReadCriteria): Promise<NotificationInboxRecord | undefined>;
}

export const NOTIFICATION_INBOX_REPOSITORY = Symbol('INotificationInboxRepository');
