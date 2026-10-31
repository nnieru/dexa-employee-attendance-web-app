import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { EventName } from '@dexa/contracts';
import { createDatabase, type Database } from '@dexa/db';
import {
  EVENT_PUBLISHER,
  MessagingModule,
  type EventMessage,
  type IEventPublisher,
} from '@dexa/messaging';
import { Test, type TestingModule } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RabbitMQContainer, type StartedRabbitMQContainer } from '@testcontainers/rabbitmq';
import {
  connect,
  type Channel,
  type ChannelModel,
  type ConfirmChannel,
  type GetMessage,
} from 'amqplib';
import { eq } from 'drizzle-orm';
import { AuditLogRepository } from '../src/audit/audit-log.repository.js';
import { auditLogs } from '../src/infrastructure/db/schema.js';
import { CONTAINER_TIMEOUT_MS, TEST_TIMEOUT_MS, createEmptyDatabaseUri } from './test-database.js';
import {
  PROCESSED_AT,
  ScriptedAuditLogWriter,
  startAuditConsumerApp,
} from './audit-consumer-app.js';

// Same image as compose.yaml, so the tests run against the broker version the services use.
const POSTGRES_IMAGE = 'postgres:18';
const RABBITMQ_IMAGE = 'rabbitmq:4-management';
const WAIT_TIMEOUT_MS = 20_000;
const WAIT_INTERVAL_MS = 25;
// The events exchange name from libs/messaging (EVENTS_EXCHANGE). The library does not export it, so the test names it.
const EVENTS_EXCHANGE = 'app.events';
// Deliveries before RabbitMQ dead-letters a message (DATABASE §6.2). The library does not export MAX_DELIVERIES.
const DELIVERIES_BEFORE_DEAD_LETTER = 3;
const OCCURRED_AT = '2026-10-30T02:05:00.000Z';
const ACCOUNT_ID = '5b7e2c1a-9f3d-4e6b-8a2c-1d0e9f8a7b6c';
const ACTOR_ACCOUNT_ID = '2c9d4f7e-1a3b-4c5d-9e8f-0a1b2c3d4e5f';
const EMPLOYEE_NAME = 'Ada Lovelace';

// The dead-letter queue name is `<queue>.dlq` (libs/messaging deadLetterQueueName, not exported).
function deadLetterQueueOf(queue: string): string {
  return `${queue}.dlq`;
}

function uniqueQueueName(): string {
  return `audit.profile-changes.${randomUUID()}`;
}

function profileUpdatedEvent(): EventMessage {
  return {
    eventId: randomUUID(),
    type: EventName.EMPLOYEE_PROFILE_UPDATED,
    occurredAt: OCCURRED_AT,
    payload: {
      accountId: ACCOUNT_ID,
      actorAccountId: ACTOR_ACCOUNT_ID,
      employeeName: EMPLOYEE_NAME,
      changedFields: ['phoneNumber', 'photo'],
    },
  };
}

function passwordChangedEvent(): EventMessage {
  return {
    eventId: randomUUID(),
    type: EventName.ACCOUNT_PASSWORD_CHANGED,
    occurredAt: OCCURRED_AT,
    payload: {
      accountId: ACCOUNT_ID,
      actorAccountId: ACCOUNT_ID,
      changedFields: ['password'],
    },
  };
}

// The broker body is Nest's { pattern, data } envelope, with the event as data (libs/messaging).
function nestBody(routingKey: string, data: unknown): Buffer {
  return Buffer.from(JSON.stringify({ pattern: routingKey, data }), 'utf8');
}

async function waitFor(predicate: () => Promise<boolean>, description: string): Promise<void> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  while (!(await predicate())) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${description}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
  }
}

async function publishRawBody(
  channel: ConfirmChannel,
  routingKey: string,
  body: Buffer,
): Promise<void> {
  await channel.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true });
  channel.publish(EVENTS_EXCHANGE, routingKey, body, { persistent: true });
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
      throw new Error(`Timed out waiting for a message in ${deadLetterQueue}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
  }
}

async function readyMessageCount(channel: ConfirmChannel, queue: string): Promise<number> {
  const { messageCount } = await channel.checkQueue(queue);
  return messageCount;
}

async function countAuditRows(database: Database, eventId?: string): Promise<number> {
  const rows =
    eventId === undefined
      ? await database.db.select({ eventId: auditLogs.eventId }).from(auditLogs)
      : await database.db
          .select({ eventId: auditLogs.eventId })
          .from(auditLogs)
          .where(eq(auditLogs.eventId, eventId));
  return rows.length;
}

describe('audit consumer on the Nest RMQ transport', () => {
  let postgres: StartedPostgreSqlContainer;
  let rabbitMq: StartedRabbitMQContainer;
  let publisherModule: TestingModule;
  let publisher: IEventPublisher;
  let observer: ChannelModel;
  let observerChannel: ConfirmChannel;
  const startedApps: INestApplication[] = [];
  const openDatabases: Database[] = [];

  function openDatabase(databaseUrl: string): Database {
    const database = createDatabase(databaseUrl);
    openDatabases.push(database);
    return database;
  }

  beforeAll(async () => {
    [postgres, rabbitMq] = await Promise.all([
      new PostgreSqlContainer(POSTGRES_IMAGE).start(),
      new RabbitMQContainer(RABBITMQ_IMAGE).start(),
    ]);
    publisherModule = await Test.createTestingModule({
      imports: [MessagingModule.forRoot({ url: rabbitMq.getAmqpUrl() })],
    }).compile();
    await publisherModule.init();
    publisher = publisherModule.get<IEventPublisher>(EVENT_PUBLISHER);
    observer = await connect(rabbitMq.getAmqpUrl());
    observerChannel = await observer.createConfirmChannel();
  }, CONTAINER_TIMEOUT_MS);

  afterEach(async () => {
    await Promise.all(startedApps.splice(0).map((app) => app.close()));
    await Promise.all(openDatabases.splice(0).map((database) => database.close()));
  });

  afterAll(async () => {
    await publisherModule?.close();
    await observer?.close();
    await rabbitMq?.stop();
    await postgres?.stop();
  }, CONTAINER_TIMEOUT_MS);

  describe('persisting a valid event', () => {
    it.each([
      {
        condition: 'employee.profile.updated',
        event: profileUpdatedEvent(),
        expectedRow: {
          eventType: 'employee.profile.updated',
          sourceService: 'employee-service',
          accountId: ACCOUNT_ID,
          actorAccountId: ACTOR_ACCOUNT_ID,
          changedFields: ['phoneNumber', 'photo'],
        },
      },
      {
        condition: 'account.password.changed',
        event: passwordChangedEvent(),
        expectedRow: {
          eventType: 'account.password.changed',
          sourceService: 'auth-service',
          accountId: ACCOUNT_ID,
          actorAccountId: ACCOUNT_ID,
          changedFields: ['password'],
        },
      },
    ])(
      'should store one row with field names only when $condition is consumed',
      async ({ event, expectedRow }) => {
        const databaseUrl = await createEmptyDatabaseUri(postgres.getConnectionUri());
        const database = openDatabase(databaseUrl);
        startedApps.push(
          await startAuditConsumerApp({
            databaseUrl,
            rabbitMqUrl: rabbitMq.getAmqpUrl(),
            queue: uniqueQueueName(),
          }),
        );

        await publisher.publish(event);

        await waitFor(async () => (await countAuditRows(database)) === 1, 'the audit row');
        const rows = await database.db.select().from(auditLogs);
        expect(rows).toEqual([
          {
            eventId: event.eventId,
            ...expectedRow,
            resourceType: null,
            resourceId: null,
            occurredAt: new Date(OCCURRED_AT),
            processedAt: PROCESSED_AT,
          },
        ]);
        expect(JSON.stringify(rows)).not.toContain(EMPLOYEE_NAME);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('redelivery', () => {
    it(
      'should keep one row and acknowledge the redelivery when the same event arrives twice',
      async () => {
        const queue = uniqueQueueName();
        const databaseUrl = await createEmptyDatabaseUri(postgres.getConnectionUri());
        const database = openDatabase(databaseUrl);
        const writer = new ScriptedAuditLogWriter(new AuditLogRepository(database), 0);
        startedApps.push(
          await startAuditConsumerApp({
            databaseUrl,
            rabbitMqUrl: rabbitMq.getAmqpUrl(),
            queue,
            auditLogWriter: writer,
          }),
        );
        const event = profileUpdatedEvent();

        await publisher.publish(event);
        await publisher.publish(event);

        await waitFor(async () => writer.successes === 2, 'both deliveries to commit');
        await waitFor(
          async () => (await readyMessageCount(observerChannel, queue)) === 0,
          'the queue to drain',
        );
        expect(await countAuditRows(database, event.eventId)).toBe(1);
        expect(await observerChannel.get(deadLetterQueueOf(queue), { noAck: true })).toBe(false);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('invalid messages', () => {
    const profilePayload = {
      accountId: ACCOUNT_ID,
      actorAccountId: ACTOR_ACCOUNT_ID,
      employeeName: EMPLOYEE_NAME,
      changedFields: ['phoneNumber', 'photo'],
    };
    const invalidCases = [
      {
        condition: 'the body is not JSON',
        routingKey: EventName.EMPLOYEE_PROFILE_UPDATED,
        body: Buffer.from('not json{', 'utf8'),
      },
      {
        condition: 'the profile payload carries an old value',
        routingKey: EventName.EMPLOYEE_PROFILE_UPDATED,
        body: nestBody(EventName.EMPLOYEE_PROFILE_UPDATED, {
          eventId: randomUUID(),
          type: EventName.EMPLOYEE_PROFILE_UPDATED,
          occurredAt: OCCURRED_AT,
          payload: { ...profilePayload, oldValues: { phoneNumber: '+6281200000000' } },
        }),
      },
      {
        condition: 'the password payload lists a second field',
        routingKey: EventName.ACCOUNT_PASSWORD_CHANGED,
        body: nestBody(EventName.ACCOUNT_PASSWORD_CHANGED, {
          eventId: randomUUID(),
          type: EventName.ACCOUNT_PASSWORD_CHANGED,
          occurredAt: OCCURRED_AT,
          payload: {
            accountId: ACCOUNT_ID,
            actorAccountId: ACCOUNT_ID,
            changedFields: ['password', 'phoneNumber'],
          },
        }),
      },
    ];

    it.each(invalidCases)(
      'should dead-letter on the first delivery without storing a row when $condition',
      async ({ routingKey, body }) => {
        const queue = uniqueQueueName();
        const databaseUrl = await createEmptyDatabaseUri(postgres.getConnectionUri());
        const database = openDatabase(databaseUrl);
        const writer = new ScriptedAuditLogWriter(new AuditLogRepository(database), 0);
        startedApps.push(
          await startAuditConsumerApp({
            databaseUrl,
            rabbitMqUrl: rabbitMq.getAmqpUrl(),
            queue,
            auditLogWriter: writer,
          }),
        );

        await publishRawBody(observerChannel, routingKey, body);

        const deadLetter = await takeDeadLetter(observerChannel, deadLetterQueueOf(queue));
        expect(writer.attempts).toBe(0);
        expect(await countAuditRows(database)).toBe(0);
        expect(deadLetter.content.equals(body)).toBe(true);
        expect(deadLetter.properties.headers?.['x-death']).toEqual([
          expect.objectContaining({ reason: 'rejected', queue }),
        ]);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('database failures', () => {
    it(
      'should store the row on the second delivery when the database fails once',
      async () => {
        const queue = uniqueQueueName();
        const databaseUrl = await createEmptyDatabaseUri(postgres.getConnectionUri());
        const database = openDatabase(databaseUrl);
        const writer = new ScriptedAuditLogWriter(new AuditLogRepository(database), 1);
        startedApps.push(
          await startAuditConsumerApp({
            databaseUrl,
            rabbitMqUrl: rabbitMq.getAmqpUrl(),
            queue,
            auditLogWriter: writer,
          }),
        );
        const event = profileUpdatedEvent();

        await publisher.publish(event);

        await waitFor(async () => writer.successes === 1, 'the second delivery to commit');
        expect(writer.attempts).toBe(2);
        expect(await countAuditRows(database, event.eventId)).toBe(1);
        await waitFor(
          async () => (await readyMessageCount(observerChannel, queue)) === 0,
          'the queue to drain',
        );
        expect(await observerChannel.get(deadLetterQueueOf(queue), { noAck: true })).toBe(false);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should retry up to the delivery limit and then dead-letter the event when the database stays unavailable',
      async () => {
        const queue = uniqueQueueName();
        const databaseUrl = await createEmptyDatabaseUri(postgres.getConnectionUri());
        const database = openDatabase(databaseUrl);
        const writer = new ScriptedAuditLogWriter(
          new AuditLogRepository(database),
          Number.POSITIVE_INFINITY,
        );
        startedApps.push(
          await startAuditConsumerApp({
            databaseUrl,
            rabbitMqUrl: rabbitMq.getAmqpUrl(),
            queue,
            auditLogWriter: writer,
          }),
        );
        const event = profileUpdatedEvent();

        await publisher.publish(event);

        const deadLetter = await takeDeadLetter(observerChannel, deadLetterQueueOf(queue));
        expect(writer.attempts).toBe(DELIVERIES_BEFORE_DEAD_LETTER);
        expect(writer.successes).toBe(0);
        expect(await countAuditRows(database, event.eventId)).toBe(0);
        expect(deadLetter.properties.messageId).toBe(event.eventId);
        expect(deadLetter.properties.headers?.['x-death']).toEqual([
          expect.objectContaining({ reason: 'delivery_limit', queue }),
        ]);
      },
      TEST_TIMEOUT_MS,
    );
  });
});
