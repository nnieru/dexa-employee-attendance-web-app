import type { NotificationDraft } from './notification-row.rules.js';

/**
 * An inbox row that this write inserted, after the database assigned its ID. The fields are as the table stores
 * them; the live stream validates them against its contract before sending.
 */
export type InsertedNotification = {
  readonly id: string;
  readonly eventType: string;
  readonly recipientAccountId: string;
  readonly title: string;
  readonly body: string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly occurredAt: Date;
  readonly createdAt: Date;
  readonly readAt: Date | null;
};

export interface INotificationWriter {
  /**
   * Stores one row per draft in a single transaction. A draft whose event and recipient already have a row is
   * skipped, so a redelivered event adds nothing. Resolves with only the rows this call inserted, once the
   * transaction has committed, which is the point where the consumer may acknowledge the message.
   */
  insertForRecipients(
    drafts: ReadonlyArray<NotificationDraft>,
  ): Promise<ReadonlyArray<InsertedNotification>>;
}

export const NOTIFICATION_WRITER = Symbol('INotificationWriter');
