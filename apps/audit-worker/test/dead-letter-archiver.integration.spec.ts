import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { EventName } from '@dexa/contracts';
import { createDatabase, type Database } from '@dexa/db';
import {
  deadLetterQueueName,
  EVENT_PUBLISHER,
  EVENTS_EXCHANGE,
  MessagingModule,
  parkedQueueName,
  type EventMessage,
  type IEventPublisher,
} from '@dexa/messaging';
import { Test, type TestingModule } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RabbitMQContainer, type StartedRabbitMQContainer } from '@testcontainers/rabbitmq';
import { connect, type ChannelModel, type ConfirmChannel, type GetMessage } from 'amqplib';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { DeadLetterArchiveRepository } from '../src/dlq/dead-letter-archive.repository.js';
import { dlqMessages } from '../src/infrastructure/db/schema.js';
import {
  CONTAINER_TIMEOUT_MS,
  TEST_TIMEOUT_MS,
  createEmptyDatabaseUri,
  requireRow,
} from './test-database.js';
import { AuditLogRepository } from '../src/audit/audit-log.repository.js';
import type { DeadLetterTiming } from '../src/dlq/dead-letter-policy.js';
import { ScriptedAuditLogWriter, startAuditConsumerApp } from './audit-consumer-app.js';
import {
  ARCHIVED_AT,
  failureWithCode,
  ScriptedDeadLetterArchiveWriter,
  startDeadLetterArchiverApp,
} from './dead-letter-archiver-app.js';

// Same images as compose.yaml, so the tests run against the broker and database versions the services use.
const POSTGRES_IMAGE = 'postgres:18';
const RABBITMQ_IMAGE = 'rabbitmq:4-management';
const WAIT_TIMEOUT_MS = 20_000;
const WAIT_INTERVAL_MS = 25;
// Retries and pauses short enough for a test. The production values are 1-8 s and 60 s.
const FAST_RETRY_DELAYS_MS = [1, 1, 1, 1];
const FAST_TIMING: DeadLetterTiming = {
  archiveRetryDelaysMs: FAST_RETRY_DELAYS_MS,
  consumerPauseMs: 60_000,
};
const SHORT_PAUSE_MS = 1_500;
const PAUSE_TIMING: DeadLetterTiming = {
  archiveRetryDelaysMs: FAST_RETRY_DELAYS_MS,
  consumerPauseMs: SHORT_PAUSE_MS,
};
// Deliveries of the failing message before the archive gives up: the initial attempt plus four retries.
const ARCHIVE_ATTEMPTS_PER_DELIVERY = FAST_RETRY_DELAYS_MS.length + 1;
// How long the test watches a paused consumer. Shorter than SHORT_PAUSE_MS, so the consumer must still be paused.
const PAUSE_OBSERVATION_MS = 300;
const OCCURRED_AT = '2026-10-30T02:05:00.000Z';
const ACCOUNT_ID = '5b7e2c1a-9f3d-4e6b-8a2c-1d0e9f8a7b6c';
const ACTOR_ACCOUNT_ID = '2c9d4f7e-1a3b-4c5d-9e8f-0a1b2c3d4e5f';
const EMPLOYEE_NAME = 'Ada Lovelace';
const FIRST_DEATH_AT = new Date('2026-10-30T02:00:00.000Z');
const LATEST_DEATH_AT = new Date('2026-10-30T02:03:00.000Z');
const REPLAY_REQUEUED_AT = new Date('2026-10-30T02:04:00.000Z');
const RESOLVED_AT = new Date('2026-10-30T02:04:30.000Z');
const LATE_DUPLICATE_AT = new Date('2026-10-30T02:09:00.000Z');
const FALLBACK_MESSAGE_ID_PATTERN = /^sha256:[0-9a-f]{64}$/;

type DeadLetterRow = typeof dlqMessages.$inferSelect;

function uniqueQueueName(): string {
  return `audit.profile-changes.${randomUUID()}`;
}

function profileUpdatedEventWithOldValues(): EventMessage {
  return {
    eventId: randomUUID(),
    type: EventName.EMPLOYEE_PROFILE_UPDATED,
    occurredAt: OCCURRED_AT,
    payload: {
      accountId: ACCOUNT_ID,
      actorAccountId: ACTOR_ACCOUNT_ID,
      employeeName: EMPLOYEE_NAME,
      changedFields: ['phoneNumber'],
      // The strict contract rejects a value field, so the consumer dead-letters this event.
      oldValues: { phoneNumber: '+6281200000000' },
    },
  };
}

// Publishes the x-death time in the wire form amqplib encodes: whole seconds since the epoch.
function xDeathEntry(overrides: {
  readonly queue: string;
  readonly reason: string;
  readonly count: number;
  readonly time: Date;
}): Record<string, unknown> {
  return {
    queue: overrides.queue,
    reason: overrides.reason,
    count: overrides.count,
    time: { '!': 'timestamp', value: Math.floor(overrides.time.getTime() / 1000) },
    exchange: EVENTS_EXCHANGE,
    'routing-keys': [EventName.EMPLOYEE_PROFILE_UPDATED],
  };
}

// A valid event: the audit consumer fails on it only when its writer does.
function validProfileUpdatedEvent(): EventMessage {
  return {
    eventId: randomUUID(),
    type: EventName.EMPLOYEE_PROFILE_UPDATED,
    occurredAt: OCCURRED_AT,
    payload: {
      accountId: ACCOUNT_ID,
      actorAccountId: ACTOR_ACCOUNT_ID,
      employeeName: EMPLOYEE_NAME,
      changedFields: ['phoneNumber'],
    },
  };
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
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

async function publishToDeadLetterQueue(
  channel: ConfirmChannel,
  deadLetterQueue: string,
  body: Buffer,
  properties: { readonly messageId?: string; readonly headers?: Record<string, unknown> } = {},
): Promise<void> {
  channel.publish('', deadLetterQueue, body, { persistent: true, ...properties });
  await channel.waitForConfirms();
}

// The archiver acknowledges a delivery only after its write commits, so an empty ready queue means archived or
// nacked for a retry. Callers wait on the row or the writer count first, then on this.
async function waitForDeadLetterQueueToDrain(
  channel: ConfirmChannel,
  deadLetterQueue: string,
): Promise<void> {
  await waitFor(async () => {
    const { messageCount } = await channel.checkQueue(deadLetterQueue);
    return messageCount === 0;
  }, `${deadLetterQueue} to drain`);
}

// Polls a queue until a message arrives, reading it without acknowledgement, which is fine for a test queue.
async function takeDeadLetter(channel: ConfirmChannel, queue: string): Promise<GetMessage> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  for (;;) {
    const message = await channel.get(queue, { noAck: true });
    if (message !== false) {
      return message;
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for a message in ${queue}.`);
    }
    await sleep(WAIT_INTERVAL_MS);
  }
}

async function readRows(database: Database, queue: string): Promise<DeadLetterRow[]> {
  return database.db.select().from(dlqMessages).where(eq(dlqMessages.sourceQueue, queue));
}

// The stored x-death entries are JSON, so their times are ISO strings.
const storedXDeathSchema = z.object({
  'x-death': z.array(z.object({ time: z.iso.datetime() })),
});

function deathTimeOf(row: DeadLetterRow, index: number): string {
  const entry = storedXDeathSchema.parse(row.headers)['x-death'][index];
  if (entry === undefined) {
    throw new Error(`Expected an x-death entry at index ${index}.`);
  }
  return entry.time;
}

describe('dead-letter archiver on the Nest RMQ transport', () => {
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

  it(
    'should archive an invalid audit event once with the attempt count and failure from x-death',
    async () => {
      const queue = uniqueQueueName();
      const databaseUrl = await createEmptyDatabaseUri(postgres.getConnectionUri());
      const database = openDatabase(databaseUrl);
      // The audit app migrates the database first; the archiver then finds the schema in place.
      startedApps.push(
        await startAuditConsumerApp({ databaseUrl, rabbitMqUrl: rabbitMq.getAmqpUrl(), queue }),
        await startDeadLetterArchiverApp({
          databaseUrl,
          rabbitMqUrl: rabbitMq.getAmqpUrl(),
          queue,
        }),
      );
      const event = profileUpdatedEventWithOldValues();

      await publisher.publish(event);

      await waitFor(async () => (await readRows(database, queue)).length === 1, 'the archived row');
      await waitForDeadLetterQueueToDrain(observerChannel, deadLetterQueueName(queue));
      const row = requireRow((await readRows(database, queue))[0]);
      expect(row).toMatchObject({
        messageId: event.eventId,
        eventId: event.eventId,
        sourceQueue: queue,
        attemptCount: 1,
        lastError: 'rejected',
        status: 'PENDING',
        requeuedAt: null,
        resolvedAt: null,
      });
      expect(row.headers).toEqual({
        'x-death': [
          expect.objectContaining({
            queue,
            reason: 'rejected',
            count: 1,
            exchange: EVENTS_EXCHANGE,
            'routing-keys': [EventName.EMPLOYEE_PROFILE_UPDATED],
          }),
        ],
      });
      expect(row.lastFailedAt).toEqual(new Date(deathTimeOf(row, 0)));
      expect(row.firstFailedAt).toEqual(row.lastFailedAt);
      expect(JSON.parse(row.payload.toString('utf8'))).toEqual({
        pattern: EventName.EMPLOYEE_PROFILE_UPDATED,
        data: event,
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should keep one row when the same dead-letter message is archived twice',
    async () => {
      const queue = uniqueQueueName();
      const databaseUrl = await createEmptyDatabaseUri(postgres.getConnectionUri());
      const database = openDatabase(databaseUrl);
      const writer = new ScriptedDeadLetterArchiveWriter(
        new DeadLetterArchiveRepository(database),
        0,
      );
      startedApps.push(
        await startDeadLetterArchiverApp({
          databaseUrl,
          rabbitMqUrl: rabbitMq.getAmqpUrl(),
          queue,
          archiveWriter: writer,
        }),
      );
      const messageId = randomUUID();
      const body = Buffer.from('{"pattern":"employee.profile.updated"}', 'utf8');

      await publishToDeadLetterQueue(observerChannel, deadLetterQueueName(queue), body, {
        messageId,
      });
      await publishToDeadLetterQueue(observerChannel, deadLetterQueueName(queue), body, {
        messageId,
      });

      await waitFor(async () => writer.successes === 2, 'both archive writes to commit');
      await waitForDeadLetterQueueToDrain(observerChannel, deadLetterQueueName(queue));
      const rows = await readRows(database, queue);
      expect(rows.map((row) => row.messageId)).toEqual([messageId]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should store a non-JSON payload published straight to the dead-letter queue as the original bytes',
    async () => {
      const queue = uniqueQueueName();
      const databaseUrl = await createEmptyDatabaseUri(postgres.getConnectionUri());
      const database = openDatabase(databaseUrl);
      const writer = new ScriptedDeadLetterArchiveWriter(
        new DeadLetterArchiveRepository(database),
        0,
      );
      startedApps.push(
        await startDeadLetterArchiverApp({
          databaseUrl,
          rabbitMqUrl: rabbitMq.getAmqpUrl(),
          queue,
          archiveWriter: writer,
        }),
      );
      // Not UTF-8 and not JSON, with a NUL byte: the row must keep every byte.
      const body = Buffer.from([0xff, 0x00, 0x7b, 0xfe, 0x22]);

      await publishToDeadLetterQueue(observerChannel, deadLetterQueueName(queue), body);

      await waitFor(async () => writer.successes === 1, 'the archive write to commit');
      await waitForDeadLetterQueueToDrain(observerChannel, deadLetterQueueName(queue));
      const row = requireRow((await readRows(database, queue))[0]);
      expect(row.payload.equals(body)).toBe(true);
      expect(row.messageId).toMatch(FALLBACK_MESSAGE_ID_PATTERN);
      expect(row).toMatchObject({
        eventId: null,
        headers: {},
        attemptCount: 1,
        lastError: 'unknown',
        firstFailedAt: ARCHIVED_AT,
        lastFailedAt: ARCHIVED_AT,
        status: 'PENDING',
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should take the attempt count and the first and last failure times from the x-death entries',
    async () => {
      const queue = uniqueQueueName();
      const databaseUrl = await createEmptyDatabaseUri(postgres.getConnectionUri());
      const database = openDatabase(databaseUrl);
      const writer = new ScriptedDeadLetterArchiveWriter(
        new DeadLetterArchiveRepository(database),
        0,
      );
      startedApps.push(
        await startDeadLetterArchiverApp({
          databaseUrl,
          rabbitMqUrl: rabbitMq.getAmqpUrl(),
          queue,
          archiveWriter: writer,
        }),
      );
      const messageId = randomUUID();

      await publishToDeadLetterQueue(
        observerChannel,
        deadLetterQueueName(queue),
        Buffer.from('{}', 'utf8'),
        {
          messageId,
          headers: {
            'x-acquired-count': 2,
            'x-death': [
              xDeathEntry({ queue, reason: 'rejected', count: 1, time: FIRST_DEATH_AT }),
              xDeathEntry({ queue, reason: 'delivery_limit', count: 2, time: LATEST_DEATH_AT }),
            ],
          },
        },
      );

      await waitFor(async () => writer.successes === 1, 'the archive write to commit');
      const row = requireRow((await readRows(database, queue))[0]);
      expect(row).toMatchObject({
        messageId,
        attemptCount: 2,
        lastError: 'delivery_limit',
        firstFailedAt: FIRST_DEATH_AT,
        lastFailedAt: LATEST_DEATH_AT,
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return a replayed message to PENDING and keep its first failure time when it fails again',
    async () => {
      const queue = uniqueQueueName();
      const databaseUrl = await createEmptyDatabaseUri(postgres.getConnectionUri());
      const database = openDatabase(databaseUrl);
      const writer = new ScriptedDeadLetterArchiveWriter(
        new DeadLetterArchiveRepository(database),
        0,
      );
      startedApps.push(
        await startDeadLetterArchiverApp({
          databaseUrl,
          rabbitMqUrl: rabbitMq.getAmqpUrl(),
          queue,
          archiveWriter: writer,
        }),
      );
      const messageId = randomUUID();
      await seedRow(database, {
        messageId,
        queue,
        status: 'REQUEUED',
        requeuedAt: REPLAY_REQUEUED_AT,
      });

      await publishToDeadLetterQueue(
        observerChannel,
        deadLetterQueueName(queue),
        Buffer.from('{}', 'utf8'),
        {
          messageId,
          headers: {
            'x-acquired-count': 3,
            'x-death': [
              xDeathEntry({ queue, reason: 'delivery_limit', count: 3, time: LATE_DUPLICATE_AT }),
            ],
          },
        },
      );

      await waitFor(async () => writer.successes === 1, 'the archive write to commit');
      const row = requireRow((await readRows(database, queue))[0]);
      expect(row).toMatchObject({
        status: 'PENDING',
        resolvedAt: null,
        requeuedAt: REPLAY_REQUEUED_AT,
        attemptCount: 3,
        lastError: 'delivery_limit',
        firstFailedAt: FIRST_DEATH_AT,
        lastFailedAt: LATE_DUPLICATE_AT,
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should leave a RESOLVED row unchanged when a late duplicate of its failure is archived',
    async () => {
      const queue = uniqueQueueName();
      const databaseUrl = await createEmptyDatabaseUri(postgres.getConnectionUri());
      const database = openDatabase(databaseUrl);
      const writer = new ScriptedDeadLetterArchiveWriter(
        new DeadLetterArchiveRepository(database),
        0,
      );
      startedApps.push(
        await startDeadLetterArchiverApp({
          databaseUrl,
          rabbitMqUrl: rabbitMq.getAmqpUrl(),
          queue,
          archiveWriter: writer,
        }),
      );
      const messageId = randomUUID();
      await seedRow(database, {
        messageId,
        queue,
        status: 'RESOLVED',
        requeuedAt: REPLAY_REQUEUED_AT,
        resolvedAt: RESOLVED_AT,
      });

      await publishToDeadLetterQueue(
        observerChannel,
        deadLetterQueueName(queue),
        Buffer.from('{}', 'utf8'),
        {
          messageId,
          headers: {
            'x-death': [
              xDeathEntry({ queue, reason: 'rejected', count: 2, time: LATE_DUPLICATE_AT }),
            ],
          },
        },
      );

      await waitFor(async () => writer.successes === 1, 'the archive write to finish');
      await waitForDeadLetterQueueToDrain(observerChannel, deadLetterQueueName(queue));
      const row = requireRow((await readRows(database, queue))[0]);
      expect(row).toMatchObject({
        status: 'RESOLVED',
        resolvedAt: RESOLVED_AT,
        attemptCount: 1,
        lastFailedAt: LATEST_DEATH_AT,
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should leave the message in the dead-letter queue when the database is unavailable',
    async () => {
      const queue = uniqueQueueName();
      const databaseUrl = await createEmptyDatabaseUri(postgres.getConnectionUri());
      const writer = new ScriptedDeadLetterArchiveWriter(undefined, Number.POSITIVE_INFINITY);
      const app = await startDeadLetterArchiverApp({
        databaseUrl,
        rabbitMqUrl: rabbitMq.getAmqpUrl(),
        queue,
        archiveWriter: writer,
        timing: FAST_TIMING,
      });
      try {
        await publishToDeadLetterQueue(
          observerChannel,
          deadLetterQueueName(queue),
          Buffer.from('not json{', 'utf8'),
        );
        // The retries run in process, then the message is requeued and the consumer pauses.
        await waitFor(
          async () => writer.attempts === ARCHIVE_ATTEMPTS_PER_DELIVERY,
          'the retries of the first delivery',
        );
      } finally {
        await app.close();
      }

      await waitFor(async () => {
        const { messageCount } = await observerChannel.checkQueue(deadLetterQueueName(queue));
        return messageCount === 1;
      }, 'the message to remain in the dead-letter queue');
      expect(writer.successes).toBe(0);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should pause the archive consumer after a transient failure and resume it after the pause',
    async () => {
      const queue = uniqueQueueName();
      const databaseUrl = await createEmptyDatabaseUri(postgres.getConnectionUri());
      const database = openDatabase(databaseUrl);
      // Fails the first delivery's five attempts with a connection error, then archives the redelivery.
      const writer = new ScriptedDeadLetterArchiveWriter(
        new DeadLetterArchiveRepository(database),
        ARCHIVE_ATTEMPTS_PER_DELIVERY,
      );
      startedApps.push(
        await startDeadLetterArchiverApp({
          databaseUrl,
          rabbitMqUrl: rabbitMq.getAmqpUrl(),
          queue,
          archiveWriter: writer,
          timing: PAUSE_TIMING,
        }),
      );
      const messageId = randomUUID();

      await publishToDeadLetterQueue(
        observerChannel,
        deadLetterQueueName(queue),
        Buffer.from('{}', 'utf8'),
        { messageId },
      );

      await waitFor(
        async () => writer.attempts === ARCHIVE_ATTEMPTS_PER_DELIVERY,
        'the retries of the first delivery',
      );
      await sleep(PAUSE_OBSERVATION_MS);
      expect(writer.attempts).toBe(ARCHIVE_ATTEMPTS_PER_DELIVERY);
      await waitFor(async () => writer.successes === 1, 'the redelivery to commit after the pause');
      expect(writer.attempts).toBe(ARCHIVE_ATTEMPTS_PER_DELIVERY + 1);
      const row = requireRow((await readRows(database, queue))[0]);
      expect(row.messageId).toBe(messageId);
      await waitForDeadLetterQueueToDrain(observerChannel, deadLetterQueueName(queue));
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should park the unchanged message and store no row when the archive fails permanently',
    async () => {
      const queue = uniqueQueueName();
      const databaseUrl = await createEmptyDatabaseUri(postgres.getConnectionUri());
      const database = openDatabase(databaseUrl);
      // SQLSTATE 23505, a unique violation: retrying cannot succeed.
      const writer = new ScriptedDeadLetterArchiveWriter(undefined, Number.POSITIVE_INFINITY, () =>
        failureWithCode('23505'),
      );
      startedApps.push(
        await startDeadLetterArchiverApp({
          databaseUrl,
          rabbitMqUrl: rabbitMq.getAmqpUrl(),
          queue,
          archiveWriter: writer,
          timing: FAST_TIMING,
        }),
      );
      const messageId = randomUUID();
      const body = Buffer.from(
        '{"pattern":"employee.profile.updated","data":{"oldValues":{}}}',
        'utf8',
      );
      const headers = {
        'x-acquired-count': 1,
        'x-death': [xDeathEntry({ queue, reason: 'rejected', count: 1, time: FIRST_DEATH_AT })],
      };

      await publishToDeadLetterQueue(observerChannel, deadLetterQueueName(queue), body, {
        messageId,
        headers,
      });

      const parked = await takeDeadLetter(observerChannel, parkedQueueName(queue));
      // A unique violation is permanent, so the archive is tried once and the message is parked without retries.
      expect(writer.attempts).toBe(1);
      expect(parked.content.equals(body)).toBe(true);
      expect(parked.properties.messageId).toBe(messageId);
      expect(parked.properties.headers).toEqual(headers);
      await waitForDeadLetterQueueToDrain(observerChannel, deadLetterQueueName(queue));
      expect(await readRows(database, queue)).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should record attempt count 3 when a message fails on every delivery of the audit queue',
    async () => {
      const queue = uniqueQueueName();
      const databaseUrl = await createEmptyDatabaseUri(postgres.getConnectionUri());
      const database = openDatabase(databaseUrl);
      const auditWriter = new ScriptedAuditLogWriter(
        new AuditLogRepository(database),
        Number.POSITIVE_INFINITY,
      );
      startedApps.push(
        await startAuditConsumerApp({
          databaseUrl,
          rabbitMqUrl: rabbitMq.getAmqpUrl(),
          queue,
          auditLogWriter: auditWriter,
        }),
        await startDeadLetterArchiverApp({
          databaseUrl,
          rabbitMqUrl: rabbitMq.getAmqpUrl(),
          queue,
          timing: FAST_TIMING,
        }),
      );
      const validEvent = validProfileUpdatedEvent();

      await publisher.publish(validEvent);

      await waitFor(async () => (await readRows(database, queue)).length === 1, 'the archived row');
      await waitForDeadLetterQueueToDrain(observerChannel, deadLetterQueueName(queue));
      const row = requireRow((await readRows(database, queue))[0]);
      expect(auditWriter.attempts).toBe(3);
      expect(row).toMatchObject({
        messageId: validEvent.eventId,
        attemptCount: 3,
        lastError: 'delivery_limit',
      });
    },
    TEST_TIMEOUT_MS,
  );

  // Inserts an existing failure row, as a replay would have left it, so a later archive is tested against it.
  async function seedRow(
    database: Database,
    seed: {
      readonly messageId: string;
      readonly queue: string;
      readonly status: 'REQUEUED' | 'RESOLVED';
      readonly requeuedAt?: Date;
      readonly resolvedAt?: Date;
    },
  ): Promise<void> {
    await database.db.insert(dlqMessages).values({
      messageId: seed.messageId,
      sourceQueue: seed.queue,
      payload: Buffer.from('{}', 'utf8'),
      attemptCount: 1,
      lastError: 'rejected',
      status: seed.status,
      firstFailedAt: FIRST_DEATH_AT,
      lastFailedAt: LATEST_DEATH_AT,
      requeuedAt: seed.requeuedAt,
      resolvedAt: seed.resolvedAt,
    });
  }
});
