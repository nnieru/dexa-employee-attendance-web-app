/**
 * Thrown by a publisher after it has been closed. Nothing was sent, so the outbox relay leaves the event
 * untouched instead of recording a failed attempt. This matters during shutdown, when the publisher can
 * close while a relay pass is still running.
 */
export class EventPublisherClosedError extends Error {
  constructor() {
    super('Event publisher is closed');
    this.name = 'EventPublisherClosedError';
  }
}
