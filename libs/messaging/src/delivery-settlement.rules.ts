import { NonRetryableMessageError } from './event-delivery.errors.js';

/** What happened to one delivery, as far as the ack interceptor can tell. */
export type DeliveryOutcome =
  | { readonly kind: 'handled' }
  | { readonly kind: 'invalid-envelope' }
  | { readonly kind: 'handler-failed'; readonly error: unknown };

/**
 * ack: the handler finished, so the broker may drop the message.
 * requeue: a transient failure. The broker redelivers the message and dead-letters it after MAX_DELIVERIES.
 * dead-letter: a redelivery cannot succeed, so the message goes to the dead-letter queue now.
 */
export type DeliverySettlement = 'ack' | 'requeue' | 'dead-letter';

export function decideDeliverySettlement(outcome: DeliveryOutcome): DeliverySettlement {
  switch (outcome.kind) {
    case 'handled':
      return 'ack';
    case 'invalid-envelope':
      return 'dead-letter';
    case 'handler-failed':
      return isNonRetryable(outcome.error) ? 'dead-letter' : 'requeue';
  }
}

function isNonRetryable(error: unknown): boolean {
  return error instanceof NonRetryableMessageError;
}
