import { randomUUID } from 'node:crypto';
import { inspect } from 'node:util';
import { Test } from '@nestjs/testing';
import { RabbitMQContainer, type StartedRabbitMQContainer } from '@testcontainers/rabbitmq';
import { connect, type Channel, type ConfirmChannel, type GetMessage } from 'amqplib';
import { EVENT_PUBLISHER, type IEventPublisher } from './event-publisher.interface.js';
import type { EventMessage } from './event-message.js';
import { MessagingModule } from './messaging.module.js';
import { EVENTS_EXCHANGE } from './event-topology.js';
import { RmqEventPublisher, createEventPublisherClient } from './rmq-event-publisher.js';

// Same image as compose.yaml, so the tests run against the broker version the services use.
const RABBITMQ_IMAGE = 'rabbitmq:4-management';
const CONTAINER_START_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 30_000;
const EVENT_TYPE = 'employee.profile.updated';
const OCCURRED_AT = '2026-10-29T03:15:00.000Z';
const PERSISTENT_DELIVERY_MODE = 2;
const JSON_CONTENT_TYPE = 'application/json';
// Nothing listens on port 1, so the connection is refused at once.
const UNREACHABLE_PASSWORD = 'publisher-secret-7f3a';
const UNREACHABLE_AMQP_URL = `amqp://publisher:${UNREACHABLE_PASSWORD}@127.0.0.1:1`;

describe('RmqEventPublisher', () => {
  let rabbitMq: StartedRabbitMQContainer;

  beforeAll(async () => {
    rabbitMq = await new RabbitMQContainer(RABBITMQ_IMAGE).start();
  }, CONTAINER_START_TIMEOUT_MS);

  afterAll(async () => {
    await rabbitMq.stop();
  });

  it(
    'should deliver the event as a persistent message with its event ID when publish resolves',
    async () => {
      const publisher = new RmqEventPublisher(createEventPublisherClient(rabbitMq.getAmqpUrl()));
      const observer = await connect(rabbitMq.getAmqpUrl());
      try {
        const channel = await observer.createConfirmChannel();
        const queue = await bindTemporaryQueue(channel, EVENT_TYPE);
        const event = buildEventMessage();

        await publisher.publish(event);

        const delivered = await takeRoutedMessage(channel, queue);
        expect(JSON.parse(delivered.content.toString('utf8'))).toEqual({
          pattern: EVENT_TYPE,
          data: event,
        });
        expect(delivered.properties).toMatchObject({
          messageId: event.eventId,
          deliveryMode: PERSISTENT_DELIVERY_MODE,
          type: EVENT_TYPE,
          contentType: JSON_CONTENT_TYPE,
        });
      } finally {
        await publisher.close();
        await observer.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should create no queue and no binding when an event is published with no consumer declared',
    async () => {
      const publisher = new RmqEventPublisher(createEventPublisherClient(rabbitMq.getAmqpUrl()));
      const queuesBefore = await listQueueNames(rabbitMq);
      const eventBindingsBefore = await listEventsExchangeBindings(rabbitMq);
      try {
        await publisher.publish(buildEventMessage());

        expect(await listQueueNames(rabbitMq)).toEqual(queuesBefore);
        expect(await listEventsExchangeBindings(rabbitMq)).toEqual(eventBindingsBefore);
      } finally {
        await publisher.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should reject with the event ID and without the broker password when the broker is unreachable',
    async () => {
      const publisher = new RmqEventPublisher(createEventPublisherClient(UNREACHABLE_AMQP_URL));
      const event = buildEventMessage();
      try {
        const failure = await publisher.publish(event).then(
          () => undefined,
          (error: unknown) => error,
        );

        expect(failure).toBeInstanceOf(Error);
        expect(failure).toHaveProperty(
          'message',
          `Event ${event.eventId} was not confirmed by the broker`,
        );
        expect(failure).toHaveProperty('cause', expect.objectContaining({ code: 'ECONNREFUSED' }));
        expect(inspect(failure, { depth: 6 })).not.toContain(UNREACHABLE_PASSWORD);
      } finally {
        await publisher.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  it('should reject the publish when the publisher is closed', async () => {
    const publisher = new RmqEventPublisher(createEventPublisherClient(rabbitMq.getAmqpUrl()));
    await publisher.close();

    await expect(publisher.publish(buildEventMessage())).rejects.toThrow(
      'Event publisher is closed',
    );
  });

  it(
    'should close the publisher with the module when the module is closed',
    async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [MessagingModule.forRoot({ url: rabbitMq.getAmqpUrl() })],
      }).compile();
      await moduleRef.init();
      const publisher = moduleRef.get<IEventPublisher>(EVENT_PUBLISHER);
      await publisher.publish(buildEventMessage());

      await moduleRef.close();

      await expect(publisher.publish(buildEventMessage())).rejects.toThrow(
        'Event publisher is closed',
      );
    },
    TEST_TIMEOUT_MS,
  );
});

function buildEventMessage(): EventMessage {
  return {
    eventId: randomUUID(),
    type: EVENT_TYPE,
    occurredAt: OCCURRED_AT,
    payload: { accountId: randomUUID(), changedFields: ['phoneNumber'] },
  };
}

// The publisher confirms only after the broker has routed the message, so a basic.get issued after the
// publish resolves finds it without waiting.
async function takeRoutedMessage(channel: Channel, queue: string): Promise<GetMessage> {
  const message = await channel.get(queue, { noAck: true });
  if (message === false) {
    throw new Error(`No message was routed to queue ${queue}`);
  }
  return message;
}

async function bindTemporaryQueue(channel: ConfirmChannel, routingKey: string): Promise<string> {
  await channel.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true });
  const { queue } = await channel.assertQueue('', { exclusive: true });
  await channel.bindQueue(queue, EVENTS_EXCHANGE, routingKey);
  return queue;
}

// rabbitmqctl runs inside the container, so the checks do not depend on management credentials.
async function listQueueNames(container: StartedRabbitMQContainer): Promise<ReadonlyArray<string>> {
  const rows = await runRabbitMqCtlJson(container, ['list_queues', 'name']);
  return rows.map((row) => {
    const name = row.name;
    if (typeof name !== 'string') {
      throw new Error('rabbitmqctl returned a queue without a name');
    }
    return name;
  });
}

async function listEventsExchangeBindings(
  container: StartedRabbitMQContainer,
): Promise<ReadonlyArray<string>> {
  const rows = await runRabbitMqCtlJson(container, [
    'list_bindings',
    'source_name',
    'destination_name',
  ]);
  return rows
    .filter((row) => row.source_name === EVENTS_EXCHANGE)
    .map((row) => `${String(row.destination_name)}`)
    .sort();
}

async function runRabbitMqCtlJson(
  container: StartedRabbitMQContainer,
  command: ReadonlyArray<string>,
): Promise<ReadonlyArray<Record<string, unknown>>> {
  const result = await container.exec(['rabbitmqctl', ...command, '--formatter', 'json']);
  if (result.exitCode !== 0) {
    throw new Error(
      `rabbitmqctl ${command.join(' ')} exited with ${result.exitCode}: ${result.stderr}`,
    );
  }
  const parsed: unknown = JSON.parse(result.stdout);
  if (!Array.isArray(parsed) || !parsed.every(isRecord)) {
    throw new Error(`rabbitmqctl ${command.join(' ')} did not return a list of objects`);
  }
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
