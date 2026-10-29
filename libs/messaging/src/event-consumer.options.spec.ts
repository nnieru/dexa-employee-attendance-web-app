import { Transport } from '@nestjs/microservices';
import {
  createDeadLetterConsumerOptions,
  createEventConsumerOptions,
} from './event-consumer.options.js';
import { MAX_DELIVERIES } from './event-topology.js';

const BROKER_URL = 'amqp://broker.test:5672';
const QUEUE = 'audit-worker.events';
const DEAD_LETTER_QUEUE = 'audit-worker.events.dlq';

describe('createEventConsumerOptions', () => {
  it('should use the RMQ transport and the broker URL when the consumer options are built', () => {
    const options = createEventConsumerOptions({ url: BROKER_URL, queue: QUEUE });

    expect(options.transport).toBe(Transport.RMQ);
    expect(options.options).toMatchObject({ urls: [BROKER_URL], queue: QUEUE });
  });

  it('should bind the queue to the events topic exchange with wildcard routing when the consumer options are built', () => {
    const options = createEventConsumerOptions({ url: BROKER_URL, queue: QUEUE });

    expect(options.options).toMatchObject({
      exchange: 'app.events',
      exchangeType: 'topic',
      wildcards: true,
    });
  });

  it('should require explicit acknowledgement when the consumer options are built', () => {
    const options = createEventConsumerOptions({ url: BROKER_URL, queue: QUEUE });

    expect(options.options).toMatchObject({ noAck: false });
  });

  it('should declare a durable quorum queue that dead-letters to the queue DLQ when the consumer options are built', () => {
    const options = createEventConsumerOptions({ url: BROKER_URL, queue: QUEUE });

    expect(options.options?.queueOptions).toEqual({
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-delivery-limit': MAX_DELIVERIES - 1,
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': DEAD_LETTER_QUEUE,
      },
    });
  });
});

describe('createDeadLetterConsumerOptions', () => {
  it('should consume the dead-letter queue of the event queue when the dead-letter options are built', () => {
    const options = createDeadLetterConsumerOptions({ url: BROKER_URL, queue: QUEUE });

    expect(options.transport).toBe(Transport.RMQ);
    expect(options.options).toMatchObject({ urls: [BROKER_URL], queue: DEAD_LETTER_QUEUE });
  });

  it('should not bind the dead-letter queue to the events exchange when the dead-letter options are built', () => {
    const options = createDeadLetterConsumerOptions({ url: BROKER_URL, queue: QUEUE });

    expect(options.options?.exchange).toBeUndefined();
    expect(options.options?.wildcards).toBeUndefined();
  });

  it('should declare a durable quorum queue without a delivery limit when the dead-letter options are built', () => {
    const options = createDeadLetterConsumerOptions({ url: BROKER_URL, queue: QUEUE });

    expect(options.options?.queueOptions).toEqual({
      durable: true,
      arguments: { 'x-queue-type': 'quorum' },
    });
  });

  it('should require explicit acknowledgement when the dead-letter options are built', () => {
    const options = createDeadLetterConsumerOptions({ url: BROKER_URL, queue: QUEUE });

    expect(options.options).toMatchObject({ noAck: false });
  });
});
