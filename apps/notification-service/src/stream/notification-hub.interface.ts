import type { InsertedNotification } from '../ingestion/notification-writer.interface.js';

export type NotificationListener = (notification: InsertedNotification) => void;

/** Lets an open stream receive the rows of one recipient. Ingestion publishes through a different port. */
export interface INotificationHub {
  /**
   * Registers a listener for the rows of one recipient. The returned function removes it, and calling it again
   * does nothing, so a closed stream can always clean up.
   */
  subscribe(recipientAccountId: string, listener: NotificationListener): () => void;
}

export const NOTIFICATION_HUB = Symbol('INotificationHub');
