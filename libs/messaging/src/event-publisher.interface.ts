import type { EventMessage } from './event-message.js';

export interface IEventPublisher {
  /**
   * Resolves once the broker has confirmed the message. Rejects when the broker refuses it or does
   * not confirm within the publish timeout. A rejected event may still have reached the broker, so
   * callers must not treat a rejection as proof that nothing was published.
   */
  publish(message: EventMessage): Promise<void>;
}

export const EVENT_PUBLISHER = Symbol('IEventPublisher');
