import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { EventName, type EmployeeLookupItem } from '@dexa/contracts';
import { createDatabase, type Database } from '@dexa/db';
import {
  deadLetterQueueName,
  EVENT_PUBLISHER,
  EVENTS_EXCHANGE,
  MAX_DELIVERIES,
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
import { NotificationRepository } from '../src/ingestion/notification.repository.js';
import { notifications } from '../src/infrastructure/db/schema.js';
import { CONTAINER_TIMEOUT_MS, TEST_TIMEOUT_MS, createEmptyDatabaseUri } from './test-database.js';
import { CREATED_AT, startNotificationConsumerApp } from './notification-consumer-app.js';
import {
  CountingNotificationWriter,
  ScriptedAuthClient,
  ScriptedEmployeeClient,
} from './scripted-clients.js';

// Same images as compose.yaml, so the tests run against the broker and database versions the services use.
const POSTGRES_IMAGE = 'postgres:18';
const RABBITMQ_IMAGE = 'rabbitmq:4-management';
const WAIT_TIMEOUT_MS = 20_000;
const WAIT_INTERVAL_MS = 25;
const OCCURRED_AT = '2026-10-30T02:05:00.000Z';
const SUBJECT_ACCOUNT_ID = '5b7e2c1a-9f3d-4e6b-8a2c-1d0e9f8a7b6c';
const ACTOR_ACCOUNT_ID = '2c9d4f7e-1a3b-4c5d-9e8f-0a1b2c3d4e5f';
const HR_RECIPIENT_IDS = [
  '1f2e3d4c-5b6a-4789-8abc-0d1e2f3a4b5c',
  '3b4c5d6e-7f80-4912-8bcd-2e3f4a5b6c7d',
];
const EMPLOYEE_NAME = 'Budi Santoso';

function uniqueQueueName(): string {
  return `hr.notifications.${randomUUID()}`;
}

function profileUpdatedEvent(): EventMessage {
  return {
    eventId: randomUUID(),
    type: EventName.EMPLOYEE_PROFILE_UPDATED,
    occurredAt: OCCURRED_AT,
    payload: {
      accountId: SUBJECT_ACCOUNT_ID,
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
      accountId: SUBJECT_ACCOUNT_ID,
      actorAccountId: SUBJECT_ACCOUNT_ID,
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

async function selectNotifications(database: Database, eventId: string) {
  return database.db.select().from(notifications).where(eq(notifications.eventId, eventId));
}

// The fields a test asserts on. The generated id and the database default are left out on purpose.
function comparableRow(row: Awaited<ReturnType<typeof selectNotifications>>[number]) {
  return {
    eventId: row.eventId,
    eventType: row.eventType,
    recipientAccountId: row.recipientAccountId,
    subjectAccountId: row.subjectAccountId,
    actorAccountId: row.actorAccountId,
    title: row.title,
    body: row.body,
    data: row.data,
    occurredAt: row.occurredAt,
    createdAt: row.createdAt,
    readAt: row.readAt,
  };
}

describe('notification consumer on the Nest RMQ transport', () => {
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

  // Starts a consumer on a fresh database and queue. Returns what a test needs to observe it.
  async function startConsumer(options: {
    readonly authClient: ScriptedAuthClient;
    readonly employeeClient: ScriptedEmployeeClient;
  }) {
    const queue = uniqueQueueName();
    const databaseUrl = await createEmptyDatabaseUri(postgres.getConnectionUri());
    const database = openDatabase(databaseUrl);
    const writer = new CountingNotificationWriter(new NotificationRepository(database));
    startedApps.push(
      await startNotificationConsumerApp({
        databaseUrl,
        rabbitMqUrl: rabbitMq.getAmqpUrl(),
        queue,
        authClient: options.authClient,
        employeeClient: options.employeeClient,
        notificationWriter: writer,
      }),
    );
    return { queue, database, writer };
  }

  describe('persisting an event', () => {
    it(
      'should insert one row per HR recipient with the profile title and body',
      async () => {
        const { database, writer } = await startConsumer({
          authClient: new ScriptedAuthClient(HR_RECIPIENT_IDS, 0),
          employeeClient: new ScriptedEmployeeClient([], 0),
        });
        const event = profileUpdatedEvent();

        await publisher.publish(event);

        await waitFor(async () => writer.commits === 1, 'the inbox rows to commit');
        const rows = await selectNotifications(database, event.eventId);
        expect(rows.map(comparableRow).sort(byRecipient)).toEqual(
          HR_RECIPIENT_IDS.map((recipientAccountId) => ({
            eventId: event.eventId,
            eventType: 'employee.profile.updated',
            recipientAccountId,
            subjectAccountId: SUBJECT_ACCOUNT_ID,
            actorAccountId: ACTOR_ACCOUNT_ID,
            title: 'Budi Santoso updated: phone number, photo',
            body: 'Changed fields: phone number, photo.',
            data: { changedFields: ['phoneNumber', 'photo'] },
            occurredAt: new Date(OCCURRED_AT),
            createdAt: CREATED_AT,
            readAt: null,
          })).sort(byRecipient),
        );
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should title the password change with the name that Employee returns',
      async () => {
        const employee: EmployeeLookupItem = {
          accountId: SUBJECT_ACCOUNT_ID,
          name: 'Ada Lovelace',
          positionName: 'Fullstack Developer',
        };
        const employeeClient = new ScriptedEmployeeClient([employee], 0);
        const { database, writer } = await startConsumer({
          authClient: new ScriptedAuthClient(HR_RECIPIENT_IDS, 0),
          employeeClient,
        });
        const event = passwordChangedEvent();

        await publisher.publish(event);

        await waitFor(async () => writer.commits === 1, 'the inbox rows to commit');
        const rows = await selectNotifications(database, event.eventId);
        expect(employeeClient.calls).toBe(1);
        expect(rows.map((row) => [row.recipientAccountId, row.title, row.body]).sort()).toEqual(
          HR_RECIPIENT_IDS.map((recipientAccountId) => [
            recipientAccountId,
            'Ada Lovelace changed their password',
            'Changed fields: password.',
          ]).sort(),
        );
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('redelivery', () => {
    it(
      'should keep one row per recipient and acknowledge the redelivery when the same event arrives twice',
      async () => {
        const { queue, database, writer } = await startConsumer({
          authClient: new ScriptedAuthClient(HR_RECIPIENT_IDS, 0),
          employeeClient: new ScriptedEmployeeClient([], 0),
        });
        const event = profileUpdatedEvent();

        await publisher.publish(event);
        await publisher.publish(event);

        await waitFor(async () => writer.commits === 2, 'both deliveries to commit');
        await waitFor(
          async () => (await readyMessageCount(observerChannel, queue)) === 0,
          'the queue to drain',
        );
        expect(await selectNotifications(database, event.eventId)).toHaveLength(
          HR_RECIPIENT_IDS.length,
        );
        expect(await observerChannel.get(deadLetterQueueName(queue), { noAck: true })).toBe(false);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('recipient and name lookup failures', () => {
    it(
      'should dead-letter the event with no rows after the delivery limit when Auth stays unavailable',
      async () => {
        const authClient = new ScriptedAuthClient(HR_RECIPIENT_IDS, Number.POSITIVE_INFINITY);
        const { queue, database } = await startConsumer({
          authClient,
          employeeClient: new ScriptedEmployeeClient([], 0),
        });
        const event = profileUpdatedEvent();

        await publisher.publish(event);

        const deadLetter = await takeDeadLetter(observerChannel, deadLetterQueueName(queue));
        expect(authClient.calls).toBe(MAX_DELIVERIES);
        expect(await selectNotifications(database, event.eventId)).toHaveLength(0);
        expect(deadLetter.properties.messageId).toBe(event.eventId);
        expect(deadLetter.properties.headers?.['x-death']).toEqual([
          expect.objectContaining({ reason: 'delivery_limit', queue }),
        ]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should store both rows on the second delivery when Auth fails once',
      async () => {
        const authClient = new ScriptedAuthClient(HR_RECIPIENT_IDS, 1);
        const { queue, database, writer } = await startConsumer({
          authClient,
          employeeClient: new ScriptedEmployeeClient([], 0),
        });
        const event = profileUpdatedEvent();

        await publisher.publish(event);

        await waitFor(async () => writer.commits === 1, 'the second delivery to commit');
        expect(authClient.calls).toBe(2);
        expect(await selectNotifications(database, event.eventId)).toHaveLength(
          HR_RECIPIENT_IDS.length,
        );
        await waitFor(
          async () => (await readyMessageCount(observerChannel, queue)) === 0,
          'the queue to drain',
        );
        expect(await observerChannel.get(deadLetterQueueName(queue), { noAck: true })).toBe(false);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should dead-letter the password event with no rows when Employee stays unavailable',
      async () => {
        const employeeClient = new ScriptedEmployeeClient([], Number.POSITIVE_INFINITY);
        const { queue, database } = await startConsumer({
          authClient: new ScriptedAuthClient(HR_RECIPIENT_IDS, 0),
          employeeClient,
        });
        const event = passwordChangedEvent();

        await publisher.publish(event);

        const deadLetter = await takeDeadLetter(observerChannel, deadLetterQueueName(queue));
        expect(employeeClient.calls).toBe(MAX_DELIVERIES);
        expect(await selectNotifications(database, event.eventId)).toHaveLength(0);
        expect(deadLetter.properties.headers?.['x-death']).toEqual([
          expect.objectContaining({ reason: 'delivery_limit', queue }),
        ]);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('invalid messages', () => {
    const profilePayload = {
      accountId: SUBJECT_ACCOUNT_ID,
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
        condition: 'the profile payload names a field that is not a profile field',
        routingKey: EventName.EMPLOYEE_PROFILE_UPDATED,
        body: nestBody(EventName.EMPLOYEE_PROFILE_UPDATED, {
          eventId: randomUUID(),
          type: EventName.EMPLOYEE_PROFILE_UPDATED,
          occurredAt: OCCURRED_AT,
          payload: { ...profilePayload, changedFields: ['email'] },
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
            accountId: SUBJECT_ACCOUNT_ID,
            actorAccountId: SUBJECT_ACCOUNT_ID,
            changedFields: ['password', 'phoneNumber'],
          },
        }),
      },
    ];

    it.each(invalidCases)(
      'should dead-letter on the first delivery without storing a row when $condition',
      async ({ routingKey, body }) => {
        const authClient = new ScriptedAuthClient(HR_RECIPIENT_IDS, 0);
        const { queue, database } = await startConsumer({
          authClient,
          employeeClient: new ScriptedEmployeeClient([], 0),
        });

        await publishRawBody(observerChannel, routingKey, body);

        const deadLetter = await takeDeadLetter(observerChannel, deadLetterQueueName(queue));
        expect(authClient.calls).toBe(0);
        expect(await database.db.select().from(notifications)).toHaveLength(0);
        expect(deadLetter.content.equals(body)).toBe(true);
        expect(deadLetter.properties.headers?.['x-death']).toEqual([
          expect.objectContaining({ reason: 'rejected', queue }),
        ]);
      },
      TEST_TIMEOUT_MS,
    );
  });
});

function byRecipient(
  first: { readonly recipientAccountId: string },
  second: { readonly recipientAccountId: string },
): number {
  return first.recipientAccountId.localeCompare(second.recipientAccountId);
}
