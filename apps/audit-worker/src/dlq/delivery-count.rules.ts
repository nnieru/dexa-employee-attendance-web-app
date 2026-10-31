import { MAX_DELIVERIES } from '@dexa/messaging';
import { z } from 'zod';

// RabbitMQ 4 quorum queues put these counters on a dead-lettered copy. Probed on rabbitmq:4-management with
// delivery limit 2: a message that failed on every delivery carried x-acquired-count 3 and x-delivery-count 3, and a
// message rejected on its first delivery carried 1 and 1. So the value is the delivery count itself, not one less.
const ACQUIRED_COUNT_HEADER = 'x-acquired-count';
const DELIVERY_COUNT_HEADER = 'x-delivery-count';
const DELIVERY_LIMIT_REASON = 'delivery_limit';

const deliveryCountSchema = z.number().int().min(1);

/**
 * The number of deliveries the message got on its source queue before it was dead-lettered, from the broker's
 * counters. Undefined when the message carries neither counter, such as a message published straight to the DLQ.
 */
export function readDeliveryCount(headers: unknown): number | undefined {
  if (typeof headers !== 'object' || headers === null || Array.isArray(headers)) {
    return undefined;
  }
  for (const header of [ACQUIRED_COUNT_HEADER, DELIVERY_COUNT_HEADER]) {
    const parsed = deliveryCountSchema.safeParse(Reflect.get(headers, header));
    if (parsed.success) {
      return parsed.data;
    }
  }
  return undefined;
}

/**
 * dlq_messages.attempt_count (DATABASE §6.1, D-45): the deliveries on the source queue before dead-lettering. When
 * the counters are absent, a delivery_limit failure means the limit was reached, so MAX_DELIVERIES deliveries were
 * made. Any other failure without counters was decided on the first delivery.
 */
export function deriveAttemptCount(input: {
  readonly deliveryCount: number | undefined;
  readonly lastError: string;
}): number {
  if (input.deliveryCount !== undefined) {
    return input.deliveryCount;
  }
  return input.lastError === DELIVERY_LIMIT_REASON ? MAX_DELIVERIES : 1;
}
