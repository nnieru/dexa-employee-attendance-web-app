/** The topic exchange that carries every event. Publishers and consumers declare it with the same settings. */
export const EVENTS_EXCHANGE = 'app.events';

/** Deliveries a message gets before RabbitMQ dead-letters it. */
export const MAX_DELIVERIES = 3;

/**
 * RabbitMQ 4.4 counts a requeue made with basic.reject as a return and dead-letters the message on the
 * delivery after the limit's returns are used up. With a limit of MAX_DELIVERIES - 1 that is exactly
 * MAX_DELIVERIES deliveries. A requeue made with basic.nack is not counted, so the ack interceptor requeues
 * transient failures with basic.reject.
 */
export const DELIVERY_LIMIT = MAX_DELIVERIES - 1;

/** Unacknowledged deliveries per consumer queue, which bounds how many handlers run at once. */
export const PREFETCH_COUNT = 10;

/** Quorum queues are what enforce the delivery limit, so every event queue and dead-letter queue uses them. */
export const QUORUM_QUEUE_ARGUMENTS = { 'x-queue-type': 'quorum' } as const;

export function deadLetterQueueName(queue: string): string {
  return `${queue}.dlq`;
}

/**
 * Holds dead-letter messages that a consumer cannot store or redeliver. Nothing consumes it; an
 * operator reviews the messages by hand.
 */
export function parkedQueueName(queue: string): string {
  return `${deadLetterQueueName(queue)}.parked`;
}
