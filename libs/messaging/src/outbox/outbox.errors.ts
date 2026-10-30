/**
 * The event cannot be stored as an outbox row: it is not an event envelope, or its occurredAt is not a
 * timestamp. Thrown before any insert, so the caller's transaction fails without a partial write.
 */
export class InvalidOutboxEventError extends Error {
  constructor() {
    super('Outbox event is not a valid event envelope');
    this.name = 'InvalidOutboxEventError';
  }
}
