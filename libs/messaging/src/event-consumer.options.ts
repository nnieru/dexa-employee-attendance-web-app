import { Transport, type RmqOptions } from '@nestjs/microservices';
import {
  DELIVERY_LIMIT,
  EVENTS_EXCHANGE,
  PREFETCH_COUNT,
  QUORUM_QUEUE_ARGUMENTS,
  deadLetterQueueName,
} from './event-topology.js';

export type EventQueueSettings = {
  readonly url: string;
  readonly queue: string;
};

/**
 * Options for a consumer app's queue. Each handler's event type is bound to the queue, so the queue
 * receives its own copy of every event instead of competing with other consumers. Failed deliveries go
 * to the queue's dead-letter queue, which connectEventConsumer declares before the consumer starts.
 */
export function createEventConsumerOptions(settings: EventQueueSettings): RmqOptions {
  return {
    transport: Transport.RMQ,
    options: {
      urls: [settings.url],
      queue: settings.queue,
      exchange: EVENTS_EXCHANGE,
      exchangeType: 'topic',
      wildcards: true,
      noAck: false,
      prefetchCount: PREFETCH_COUNT,
      queueOptions: {
        durable: true,
        arguments: {
          ...QUORUM_QUEUE_ARGUMENTS,
          'x-delivery-limit': DELIVERY_LIMIT,
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': deadLetterQueueName(settings.queue),
        },
      },
    },
  };
}

/**
 * Options for a consumer of a queue's dead-letter queue. It is not bound to the exchange and has no
 * delivery limit. Do not apply RmqAckInterceptor to it: the dead-letter queue has no dead-letter
 * exchange, so a message the interceptor dead-letters would be discarded.
 */
export function createDeadLetterConsumerOptions(settings: EventQueueSettings): RmqOptions {
  return {
    transport: Transport.RMQ,
    options: {
      urls: [settings.url],
      queue: deadLetterQueueName(settings.queue),
      noAck: false,
      prefetchCount: PREFETCH_COUNT,
      queueOptions: {
        durable: true,
        arguments: { ...QUORUM_QUEUE_ARGUMENTS },
      },
    },
  };
}
