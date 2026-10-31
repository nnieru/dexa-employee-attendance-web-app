import type { InsertedNotification } from './notification-writer.interface.js';

/**
 * Hands newly committed inbox rows to the live stream. Ingestion calls it only after the write has committed, so a
 * subscriber never receives a row that the inbox does not hold. Delivery is best effort: the inbox is the source of
 * truth, so a missed push never loses a notification, and the call does not throw.
 */
export interface INotificationPublisher {
  publish(notifications: ReadonlyArray<InsertedNotification>): void;
}

export const NOTIFICATION_PUBLISHER = Symbol('INotificationPublisher');
