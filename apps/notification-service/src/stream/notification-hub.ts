import { Injectable, Logger } from '@nestjs/common';
import type { INotificationPublisher } from '../ingestion/notification-publisher.interface.js';
import type { InsertedNotification } from '../ingestion/notification-writer.interface.js';
import type { INotificationHub, NotificationListener } from './notification-hub.interface.js';

/**
 * Holds the open streams in this process. Subscribers live in memory, so live push needs a single notification-service
 * instance (ARCHITECTURE, known limits); the inbox works with any number. Each subscriber set is removed once empty,
 * so a closed stream leaves nothing behind.
 */
@Injectable()
export class NotificationHub implements INotificationHub, INotificationPublisher {
  private readonly logger = new Logger(NotificationHub.name);
  private readonly listenersByRecipient = new Map<string, Set<NotificationListener>>();

  subscribe(recipientAccountId: string, listener: NotificationListener): () => void {
    const listeners = this.listenersByRecipient.get(recipientAccountId) ?? new Set();
    listeners.add(listener);
    this.listenersByRecipient.set(recipientAccountId, listeners);
    return () => this.unsubscribe(recipientAccountId, listener);
  }

  publish(notifications: ReadonlyArray<InsertedNotification>): void {
    for (const notification of notifications) {
      const listeners = this.listenersByRecipient.get(notification.recipientAccountId);
      for (const listener of [...(listeners ?? [])]) {
        this.deliver(listener, notification);
      }
    }
  }

  /** The number of open subscriptions. The stream tests use it to show that a closed stream left none behind. */
  subscriberCount(): number {
    let count = 0;
    for (const listeners of this.listenersByRecipient.values()) {
      count += listeners.size;
    }
    return count;
  }

  private unsubscribe(recipientAccountId: string, listener: NotificationListener): void {
    const listeners = this.listenersByRecipient.get(recipientAccountId);
    if (listeners === undefined) return;
    listeners.delete(listener);
    if (listeners.size === 0) {
      this.listenersByRecipient.delete(recipientAccountId);
    }
  }

  // A listener that throws must not stop the other streams, and the rows are already committed, so it is logged
  // by name only: the error text can carry the notification's content.
  private deliver(listener: NotificationListener, notification: InsertedNotification): void {
    try {
      listener(notification);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.name : 'unknown error';
      this.logger.error(
        `A notification stream listener failed (${reason}); the inbox row is kept.`,
      );
    }
  }
}
