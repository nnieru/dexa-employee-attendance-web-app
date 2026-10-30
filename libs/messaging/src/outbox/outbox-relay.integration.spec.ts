import { jest } from '@jest/globals';
import { CLOCK, SystemClock } from '@dexa/common';
import { createDatabase, runMigrations, type Database } from '@dexa/db';
import { Global, Logger, Module, type DynamicModule } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RabbitMQContainer, type StartedRabbitMQContainer } from '@testcontainers/rabbitmq';
import { connect, type Channel, type GetMessage } from 'amqplib';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import type { EventMessage } from '../event-message.js';
import { EventPublisherClosedError } from '../event-publisher.errors.js';
import { EVENT_PUBLISHER, type IEventPublisher } from '../event-publisher.interface.js';
import { EVENTS_EXCHANGE } from '../event-topology.js';
import { MessagingModule } from '../messaging.module.js';
import { outboxEvents } from './outbox-events.table.js';
import { OUTBOX_WRITER, type IOutboxWriter } from './outbox-writer.interface.js';
import { OutboxWriter } from './outbox-writer.js';
import { OutboxModule } from './outbox.module.js';

// Same images as compose.yaml, so the tests run against the broker and database versions the services use.
const POSTGRES_IMAGE = 'postgres:18';
const RABBITMQ_IMAGE = 'rabbitmq:4-management';
const CONTAINER_START_TIMEOUT_MS = 120_000;
// An outage test waits out the 5 s publish timeouts and the retry backoff, so it needs far more than a unit test.
const TEST_TIMEOUT_MS = 120_000;
const WAIT_TIMEOUT_MS = 90_000;
const WAIT_INTERVAL_MS = 25;
// A short poll keeps the tests quick. The 500 ms default is covered by the settings unit test.
const TEST_POLL_INTERVAL_MS = 10;
const EVENT_TYPE = 'employee.profile.updated';
const OCCURRED_AT = '2026-10-29T03:15:00.000Z';
const FAR_FUTURE = new Date('2100-01-01T00:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1_000;
const DATABASE_TOKEN = Symbol('TEST_DATABASE');
const ROLLBACK_REASON = 'business rule rejected the change';
const OUTBOX_MIGRATIONS_FOLDER = fileURLToPath(
  new URL('../../test/fixtures/outbox-migrations', import.meta.url),
);

type OutboxRow = typeof outboxEvents.$inferSelect;

type RelayModuleOptions = {
  readonly publisher?: IEventPublisher;
  readonly retentionDays?: number;
};

type SeedEventInput = {
  readonly rowId?: string;
  readonly createdAt?: Date;
  readonly publishedAt?: Date;
  readonly nextAttemptAt?: Date;
};

let postgres: StartedPostgreSqlContainer;
let rabbitMq: StartedRabbitMQContainer;
let database: Database;
const openModules: TestingModule[] = [];

@Global()
@Module({})
class GlobalProvidersModule {
  static with(
    providers: ReadonlyArray<{ readonly provide: symbol; readonly useValue: unknown }>,
  ): DynamicModule {
    return {
      module: GlobalProvidersModule,
      global: true,
      providers: [...providers],
      exports: providers.map((provider) => provider.provide),
    };
  }
}

// Holds the first publish until the test releases it. Any later publish fails the way a publisher closed
// during shutdown does, so a test can check what the relay records for each case.
class GatedPublisher implements IEventPublisher {
  readonly attemptedEventIds: string[] = [];
  private readonly gate: Promise<void>;
  private releaseGate: () => void = () => undefined;

  constructor() {
    this.gate = new Promise<void>((resolve) => {
      this.releaseGate = resolve;
    });
  }

  async publish(message: EventMessage): Promise<void> {
    this.attemptedEventIds.push(message.eventId);
    if (this.attemptedEventIds.length > 1) {
      throw new EventPublisherClosedError();
    }
    await this.gate;
  }

  release(): void {
    this.releaseGate();
  }
}

beforeAll(async () => {
  [postgres, rabbitMq] = await Promise.all([
    new PostgreSqlContainer(POSTGRES_IMAGE).start(),
    new RabbitMQContainer(RABBITMQ_IMAGE).start(),
  ]);
  database = createDatabase(postgres.getConnectionUri());
  await runMigrations(database, OUTBOX_MIGRATIONS_FOLDER);
}, CONTAINER_START_TIMEOUT_MS);

beforeEach(() => {
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
});

afterEach(async () => {
  jest.restoreAllMocks();
  await Promise.all(openModules.splice(0).map((moduleRef) => moduleRef.close()));
  await database.db.delete(outboxEvents);
});

afterAll(async () => {
  await database.close();
  await Promise.all([postgres.stop(), rabbitMq.stop()]);
});

describe('OutboxRelay on Postgres and RabbitMQ', () => {
  it(
    'should never publish an event when its transaction rolled back',
    async () => {
      const queue = await bindEventQueue();
      const moduleRef = await createRelayModule();
      const writer = writerOf(moduleRef);
      const rolledBack = buildEvent();
      const committed = buildEvent();

      await expect(
        database.db.transaction(async (transaction) => {
          await writer.add(transaction, rolledBack);
          throw new Error(ROLLBACK_REASON);
        }),
      ).rejects.toThrow(ROLLBACK_REASON);
      await writeCommitted(writer, committed);

      expect(await readMessageIds(queue, 1)).toEqual([committed.eventId]);
      expect(await readRow(rolledBack.eventId)).toBeUndefined();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should publish every event once, in creation order, when the broker recovers',
    async () => {
      const queue = await bindEventQueue();
      const moduleRef = await createRelayModule();
      const writer = writerOf(moduleRef);
      const events: readonly [EventMessage, EventMessage, EventMessage] = [
        buildEvent(),
        buildEvent(),
        buildEvent(),
      ];
      const [firstEvent, secondEvent] = events;

      await stopBroker();
      try {
        for (const event of events) {
          await writeCommitted(writer, event);
        }
        await waitForRow(
          firstEvent.eventId,
          (row) => row.attemptCount >= 1,
          'the first event to fail',
        );
        // The later events were written during the outage. They wait behind the failing first event.
        expect(await readRow(secondEvent.eventId)).toMatchObject({
          attemptCount: 0,
          publishedAt: null,
        });
      } finally {
        await startBroker();
      }

      expect(await readMessageIds(queue, events.length)).toEqual(
        events.map((event) => event.eventId),
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should record a growing attempt count and a sanitized error when the broker is down',
    async () => {
      const queue = await bindEventQueue();
      const moduleRef = await createRelayModule();
      const accountId = randomUUID();
      const event = buildEvent(accountId);

      await stopBroker();
      try {
        await writeCommitted(writerOf(moduleRef), event);
        const firstFailure = await waitForRow(
          event.eventId,
          (row) => row.attemptCount >= 1,
          'the first failed attempt',
        );
        const secondFailure = await waitForRow(
          event.eventId,
          (row) => row.attemptCount >= 2,
          'the second failed attempt',
        );

        expect(secondFailure.nextAttemptAt.getTime()).toBeGreaterThan(
          firstFailure.nextAttemptAt.getTime(),
        );
        expect(secondFailure.lastError).toContain('was not confirmed by the broker');
        expect(secondFailure.lastError).not.toContain('amqp://');
        expect(warningMessages()).toContainEqual(expect.stringContaining(event.eventId));
        // The payload can hold personal data, so no log line may carry it.
        expect(warningMessages().join('\n')).not.toContain(accountId);
      } finally {
        await startBroker();
      }

      expect(await readMessageIds(queue, 1)).toEqual([event.eventId]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should publish each event exactly once when two relays share the database',
    async () => {
      const queue = await bindEventQueue();
      const firstModule = await createRelayModule();
      await createRelayModule();
      const writer = writerOf(firstModule);
      const events = Array.from({ length: 40 }, () => buildEvent());

      for (const event of events) {
        await writeCommitted(writer, event);
      }

      const messageIds = await readMessageIds(queue, events.length);
      expect([...messageIds].sort()).toEqual(events.map((event) => event.eventId).sort());
      expect(await hasPendingMessage(queue)).toBe(false);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should record a failed attempt and publish nothing when the stored payload belongs to another event',
    async () => {
      const queue = await bindEventQueue();
      await createRelayModule();
      const rowId = await seedEvent({ rowId: randomUUID() });

      const failed = await waitForRow(rowId, (row) => row.attemptCount >= 1, 'a failed attempt');

      expect(failed).toMatchObject({ publishedAt: null });
      expect(failed.lastError).toContain('not the envelope of this event');
      expect(await hasPendingMessage(queue)).toBe(false);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should delete expired published events and keep unpublished ones when retention runs',
    async () => {
      const now = Date.now();
      const expiredId = await seedEvent({
        createdAt: new Date(now - 8 * DAY_MS),
        publishedAt: new Date(now - 8 * DAY_MS),
      });
      const keptId = await seedEvent({
        createdAt: new Date(now - 6 * DAY_MS),
        publishedAt: new Date(now - 6 * DAY_MS),
      });
      // Not due for a retry, so it stays unpublished. Retention must not delete it.
      const pendingId = await seedEvent({
        createdAt: new Date(now - 30 * DAY_MS),
        nextAttemptAt: FAR_FUTURE,
      });

      await createRelayModule();

      await waitUntilTrue(
        async () => (await readRow(expiredId)) === undefined,
        'the expired event',
      );
      expect(await readRow(keptId)).toBeDefined();
      expect(await readRow(pendingId)).toMatchObject({ publishedAt: null, attemptCount: 0 });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should finish the publish in flight and record it when the module closes',
    async () => {
      const publisher = new GatedPublisher();
      const moduleRef = await createRelayModule({ publisher });
      const event = buildEvent();
      await writeCommitted(writerOf(moduleRef), event);
      await waitUntilTrue(
        async () => publisher.attemptedEventIds.includes(event.eventId),
        'the publish to start',
      );

      const closing = closeModule(moduleRef);
      publisher.release();
      await closing;

      expect(await readRow(event.eventId)).toMatchObject({
        attemptCount: 0,
        lastError: null,
        publishedAt: expect.any(Date),
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should leave the second event without a recorded attempt when the publisher closes mid-pass',
    async () => {
      const publisher = new GatedPublisher();
      const writer = new OutboxWriter();
      const first = buildEvent();
      const second = buildEvent();
      await writeCommitted(writer, first);
      await writeCommitted(writer, second);
      const moduleRef = await createRelayModule({ publisher });
      await waitUntilTrue(
        async () => publisher.attemptedEventIds.includes(first.eventId),
        'the first publish to start',
      );

      const closing = closeModule(moduleRef);
      publisher.release();
      await closing;

      expect(await readRow(first.eventId)).toMatchObject({ publishedAt: expect.any(Date) });
      expect(await readRow(second.eventId)).toMatchObject({
        publishedAt: null,
        attemptCount: 0,
        lastError: null,
      });
    },
    TEST_TIMEOUT_MS,
  );
});

// Compiles and starts a relay module on the shared database and broker. The module is closed after the test.
async function createRelayModule(options: RelayModuleOptions = {}): Promise<TestingModule> {
  const builder = Test.createTestingModule({
    imports: [
      GlobalProvidersModule.with([
        { provide: DATABASE_TOKEN, useValue: database },
        { provide: CLOCK, useValue: new SystemClock() },
      ]),
      MessagingModule.forRoot({ url: rabbitMq.getAmqpUrl() }),
      OutboxModule.forRoot({
        databaseToken: DATABASE_TOKEN,
        pollIntervalMs: TEST_POLL_INTERVAL_MS,
        retentionDays: options.retentionDays,
      }),
    ],
  });
  if (options.publisher !== undefined) {
    builder.overrideProvider(EVENT_PUBLISHER).useValue(options.publisher);
  }
  const moduleRef = await builder.compile();
  openModules.push(moduleRef);
  await moduleRef.init();
  return moduleRef;
}

async function closeModule(moduleRef: TestingModule): Promise<void> {
  const index = openModules.indexOf(moduleRef);
  if (index !== -1) {
    openModules.splice(index, 1);
  }
  await moduleRef.close();
}

function writerOf(moduleRef: TestingModule): IOutboxWriter {
  return moduleRef.get<IOutboxWriter>(OUTBOX_WRITER);
}

async function writeCommitted(writer: IOutboxWriter, event: EventMessage): Promise<void> {
  await database.db.transaction((transaction) => writer.add(transaction, event));
}

function buildEvent(accountId: string = randomUUID()): EventMessage {
  return {
    eventId: randomUUID(),
    type: EVENT_TYPE,
    occurredAt: OCCURRED_AT,
    payload: { accountId, changedFields: ['phoneNumber'] },
  };
}

// Inserts a row directly, so a test can set its timestamps. The default payload is a valid envelope whose
// event ID matches the row unless `rowId` is given.
async function seedEvent(input: SeedEventInput): Promise<string> {
  const event = buildEvent();
  const rowId = input.rowId ?? event.eventId;
  await database.db.insert(outboxEvents).values({
    id: rowId,
    eventType: event.type,
    payload: event,
    occurredAt: new Date(event.occurredAt),
    createdAt: input.createdAt,
    publishedAt: input.publishedAt,
    nextAttemptAt: input.nextAttemptAt,
  });
  return rowId;
}

async function readRow(eventId: string): Promise<OutboxRow | undefined> {
  const [row] = await database.db.select().from(outboxEvents).where(eq(outboxEvents.id, eventId));
  return row;
}

async function waitForRow(
  eventId: string,
  isReady: (row: OutboxRow) => boolean,
  description: string,
): Promise<OutboxRow> {
  return waitUntilDefined(async () => {
    const row = await readRow(eventId);
    return row !== undefined && isReady(row) ? row : undefined;
  }, description);
}

async function waitUntilTrue(
  condition: () => Promise<boolean>,
  description: string,
): Promise<void> {
  await waitUntilDefined(async () => ((await condition()) ? true : undefined), description);
}

// Polls until `read` returns a value. The test fails with the description, not after a fixed delay.
async function waitUntilDefined<T>(
  read: () => Promise<T | undefined>,
  description: string,
): Promise<T> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  for (;;) {
    const value = await read();
    if (value !== undefined) {
      return value;
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${description}`);
    }
    await delay(WAIT_INTERVAL_MS);
  }
}

// Runs against a fresh connection, because a broker outage closes every connection opened before it.
async function withBrokerChannel<T>(run: (channel: Channel) => Promise<T>): Promise<T> {
  const connection = await connect(rabbitMq.getAmqpUrl());
  try {
    return await run(await connection.createChannel());
  } finally {
    await connection.close();
  }
}

// A durable queue bound to the event type. It keeps the messages published during an outage, so the test can
// read them once the broker is back.
async function bindEventQueue(): Promise<string> {
  const queue = `outbox-test.${randomUUID()}`;
  await withBrokerChannel(async (channel) => {
    await channel.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true });
    await channel.assertQueue(queue, { durable: true });
    await channel.bindQueue(queue, EVENTS_EXCHANGE, EVENT_TYPE);
  });
  return queue;
}

async function readMessageIds(queue: string, count: number): Promise<string[]> {
  return withBrokerChannel(async (channel) => {
    const messageIds: string[] = [];
    await waitUntilTrue(async () => {
      const message = await channel.get(queue, { noAck: true });
      if (message !== false) {
        messageIds.push(readMessageId(message));
      }
      return messageIds.length >= count;
    }, `${count} messages on ${queue}`);
    return messageIds;
  });
}

async function hasPendingMessage(queue: string): Promise<boolean> {
  return withBrokerChannel(async (channel) => {
    const message = await channel.get(queue, { noAck: true });
    return message !== false;
  });
}

function readMessageId(message: GetMessage): string {
  const { messageId } = message.properties;
  if (typeof messageId !== 'string') {
    throw new Error('A published message has no message ID');
  }
  return messageId;
}

// Stopping the application makes the AMQP listener refuse connections, which is what a broker outage looks
// like to the publisher. The container, its port, and the durable queues all stay in place.
async function stopBroker(): Promise<void> {
  await runRabbitMqCtl('stop_app');
}

async function startBroker(): Promise<void> {
  await runRabbitMqCtl('start_app');
}

async function runRabbitMqCtl(command: string): Promise<void> {
  const result = await rabbitMq.exec(['rabbitmqctl', command]);
  if (result.exitCode !== 0) {
    throw new Error(`rabbitmqctl ${command} exited with ${result.exitCode}: ${result.stderr}`);
  }
}

function warningMessages(): string[] {
  return jest.mocked(Logger.prototype.warn).mock.calls.map(([message]) => String(message));
}
