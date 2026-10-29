import { randomUUID } from 'node:crypto';
import { Controller, type INestApplication, type Type } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { Test, type TestingModule } from '@nestjs/testing';
import { RabbitMQContainer, type StartedRabbitMQContainer } from '@testcontainers/rabbitmq';
import {
  connect,
  type Channel,
  type ChannelModel,
  type ConfirmChannel,
  type GetMessage,
} from 'amqplib';
import { connectEventConsumer } from './connect-event-consumer.js';
import { NonRetryableMessageError } from './event-delivery.errors.js';
import type { EventMessage } from './event-message.js';
import { EVENT_PUBLISHER, type IEventPublisher } from './event-publisher.interface.js';
import { EVENTS_EXCHANGE, MAX_DELIVERIES, deadLetterQueueName } from './event-topology.js';
import { MessagingModule } from './messaging.module.js';

// Same image as compose.yaml, so the tests run against the broker version the services use.
const RABBITMQ_IMAGE = 'rabbitmq:4-management';
const CONTAINER_START_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 60_000;
const WAIT_TIMEOUT_MS = 20_000;
const WAIT_INTERVAL_MS = 25;
const EVENT_TYPE = 'employee.profile.updated';
const OCCURRED_AT = '2026-10-29T03:15:00.000Z';
const TRANSIENT_FAILURE = 'database unavailable';

type ConsumedEventHandler = (event: EventMessage) => Promise<void>;

describe('event consumers on the Nest RMQ transport', () => {
  let rabbitMq: StartedRabbitMQContainer;
  let publisherModule: TestingModule;
  let publisher: IEventPublisher;
  let observer: ChannelModel;
  let observerChannel: ConfirmChannel;
  const startedApps: INestApplication[] = [];

  beforeAll(async () => {
    rabbitMq = await new RabbitMQContainer(RABBITMQ_IMAGE).start();
    publisherModule = await Test.createTestingModule({
      imports: [MessagingModule.forRoot({ url: rabbitMq.getAmqpUrl() })],
    }).compile();
    await publisherModule.init();
    publisher = publisherModule.get<IEventPublisher>(EVENT_PUBLISHER);
    observer = await connect(rabbitMq.getAmqpUrl());
    observerChannel = await observer.createConfirmChannel();
  }, CONTAINER_START_TIMEOUT_MS);

  afterEach(async () => {
    await Promise.all(startedApps.splice(0).map((app) => app.close()));
  });

  afterAll(async () => {
    await publisherModule.close();
    await observer.close();
    await rabbitMq.stop();
  });

  it(
    'should deliver the event to both queues when two consumers bind the same event type',
    async () => {
      const queueA = uniqueQueueName('audit-worker');
      const queueB = uniqueQueueName('notification-service');
      const receivedByA: EventMessage[] = [];
      const receivedByB: EventMessage[] = [];
      startedApps.push(
        await startConsumer(queueA, async (event) => {
          receivedByA.push(event);
        }),
        await startConsumer(queueB, async (event) => {
          receivedByB.push(event);
        }),
      );
      const event = buildEventMessage();

      await publisher.publish(event);

      await waitFor(() => receivedByA.length === 1 && receivedByB.length === 1, 'both consumers');
      expect(receivedByA).toEqual([event]);
      expect(receivedByB).toEqual([event]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should dead-letter the event with an x-death header after exactly three deliveries when the handler always fails',
    async () => {
      const queue = uniqueQueueName('employee-audit');
      let attempts = 0;
      startedApps.push(
        await startConsumer(queue, async () => {
          attempts += 1;
          throw new Error(TRANSIENT_FAILURE);
        }),
      );
      const event = buildEventMessage();

      await publisher.publish(event);

      const deadLetter = await takeDeadLetter(observerChannel, deadLetterQueueName(queue));
      expect(attempts).toBe(MAX_DELIVERIES);
      expect(deadLetter.properties.headers?.['x-death']).toEqual([
        expect.objectContaining({ reason: 'delivery_limit', queue }),
      ]);
      expect(deadLetter.properties.messageId).toBe(event.eventId);
      expect(JSON.parse(deadLetter.content.toString('utf8'))).toEqual({
        pattern: EVENT_TYPE,
        data: event,
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should acknowledge the event on the second delivery and leave the dead-letter queue empty when the handler fails once',
    async () => {
      const queue = uniqueQueueName('employee-audit');
      let attempts = 0;
      startedApps.push(
        await startConsumer(queue, async () => {
          attempts += 1;
          if (attempts === 1) {
            throw new Error(TRANSIENT_FAILURE);
          }
        }),
      );

      await publisher.publish(buildEventMessage());

      await waitFor(() => attempts === 2, 'the second delivery');
      await waitForQueueToDrain(rabbitMq, queue);
      expect(attempts).toBe(2);
      expect(await observerChannel.get(deadLetterQueueName(queue), { noAck: true })).toBe(false);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should dead-letter the event on the first delivery when the handler throws NonRetryableMessageError',
    async () => {
      const queue = uniqueQueueName('employee-audit');
      let attempts = 0;
      startedApps.push(
        await startConsumer(queue, async () => {
          attempts += 1;
          throw new NonRetryableMessageError('payload rejected by validation');
        }),
      );

      await publisher.publish(buildEventMessage());

      const deadLetter = await takeDeadLetter(observerChannel, deadLetterQueueName(queue));
      expect(attempts).toBe(1);
      expect(deadLetter.properties.headers?.['x-death']).toEqual([
        expect.objectContaining({ reason: 'rejected', queue }),
      ]);
    },
    TEST_TIMEOUT_MS,
  );

  it.each([
    { condition: 'the body is not JSON', body: Buffer.from('not json{', 'utf8') },
    {
      condition: 'the JSON body has no event envelope',
      body: Buffer.from(JSON.stringify({ foo: 'bar' }), 'utf8'),
    },
    {
      condition: 'the envelope data is not an event message',
      body: Buffer.from(JSON.stringify({ pattern: EVENT_TYPE, data: { foo: 'bar' } }), 'utf8'),
    },
  ])(
    'should dead-letter the message on the first delivery without calling the handler when $condition',
    async ({ body }) => {
      const queue = uniqueQueueName('employee-audit');
      let attempts = 0;
      startedApps.push(
        await startConsumer(queue, async () => {
          attempts += 1;
        }),
      );

      await publishRawBody(observerChannel, body);

      const deadLetter = await takeDeadLetter(observerChannel, deadLetterQueueName(queue));
      expect(attempts).toBe(0);
      expect(deadLetter.content.equals(body)).toBe(true);
      expect(deadLetter.properties.headers?.['x-death']).toEqual([
        expect.objectContaining({ reason: 'rejected', queue }),
      ]);
    },
    TEST_TIMEOUT_MS,
  );

  async function startConsumer(
    queue: string,
    handle: ConsumedEventHandler,
  ): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({
      controllers: [createEventConsumer(handle)],
    }).compile();
    const app = moduleRef.createNestApplication({ logger: false });
    await connectEventConsumer(app, { url: rabbitMq.getAmqpUrl(), queue });
    await app.init();
    await app.startAllMicroservices();
    return app;
  }
});

// A class per consumer, so each test controls the handler through its closure.
function createEventConsumer(handle: ConsumedEventHandler): Type<unknown> {
  @Controller()
  class EventConsumerController {
    @EventPattern(EVENT_TYPE)
    onEvent(@Payload() event: EventMessage): Promise<void> {
      return handle(event);
    }
  }
  return EventConsumerController;
}

function buildEventMessage(): EventMessage {
  return {
    eventId: randomUUID(),
    type: EVENT_TYPE,
    occurredAt: OCCURRED_AT,
    payload: { accountId: randomUUID(), changedFields: ['phoneNumber'] },
  };
}

function uniqueQueueName(purpose: string): string {
  return `${purpose}.${randomUUID()}`;
}

async function publishRawBody(channel: ConfirmChannel, body: Buffer): Promise<void> {
  await channel.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true });
  channel.publish(EVENTS_EXCHANGE, EVENT_TYPE, body, { persistent: true });
  await channel.waitForConfirms();
}

// Polls the dead-letter queue until a message arrives. The message is read without acknowledgement, which is
// fine for a test queue.
async function takeDeadLetter(channel: Channel, deadLetterQueue: string): Promise<GetMessage> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  for (;;) {
    const message = await channel.get(deadLetterQueue, { noAck: true });
    if (message !== false) {
      return message;
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for a message in ${deadLetterQueue}`);
    }
    await sleep(WAIT_INTERVAL_MS);
  }
}

async function waitForQueueToDrain(
  container: StartedRabbitMQContainer,
  queue: string,
): Promise<void> {
  await waitFor(async () => {
    const counts = await readQueueCounts(container, queue);
    return counts.ready === 0 && counts.unacknowledged === 0;
  }, `queue ${queue} to drain`);
}

// rabbitmqctl runs inside the container, so the counts include unacknowledged deliveries. AMQP's checkQueue
// reports only the ready ones.
async function readQueueCounts(
  container: StartedRabbitMQContainer,
  queue: string,
): Promise<{ ready: number; unacknowledged: number }> {
  const result = await container.exec([
    'rabbitmqctl',
    'list_queues',
    'name',
    'messages_ready',
    'messages_unacknowledged',
    '--formatter',
    'json',
  ]);
  if (result.exitCode !== 0) {
    throw new Error(`rabbitmqctl list_queues exited with ${result.exitCode}: ${result.stderr}`);
  }
  const parsed: unknown = JSON.parse(result.stdout);
  const row = Array.isArray(parsed) ? parsed.find((entry) => isNamedRow(entry, queue)) : undefined;
  if (!isCountRow(row)) {
    throw new Error(`rabbitmqctl did not report queue ${queue}`);
  }
  return { ready: row.messages_ready, unacknowledged: row.messages_unacknowledged };
}

function isNamedRow(value: unknown, queue: string): boolean {
  return isRecord(value) && value.name === queue;
}

function isCountRow(
  value: unknown,
): value is { messages_ready: number; messages_unacknowledged: number } {
  return (
    isRecord(value) &&
    typeof value.messages_ready === 'number' &&
    typeof value.messages_unacknowledged === 'number'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Waits for a condition with a bounded number of polls. The test fails with the condition's name, not after
// an arbitrary fixed delay.
async function waitFor(
  condition: () => boolean | Promise<boolean>,
  description: string,
): Promise<void> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  while (!(await condition())) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${description}`);
    }
    await sleep(WAIT_INTERVAL_MS);
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
