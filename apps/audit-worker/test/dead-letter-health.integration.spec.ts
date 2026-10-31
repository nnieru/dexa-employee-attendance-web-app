import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { createDatabase, type Database } from '@dexa/db';
import { deadLetterQueueName } from '@dexa/messaging';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RabbitMQContainer, type StartedRabbitMQContainer } from '@testcontainers/rabbitmq';
import { connect, type ChannelModel, type ConfirmChannel } from 'amqplib';
import request from 'supertest';
import { DeadLetterArchiveRepository } from '../src/dlq/dead-letter-archive.repository.js';
import type { DeadLetterTiming } from '../src/dlq/dead-letter-policy.js';
import { CONTAINER_TIMEOUT_MS, TEST_TIMEOUT_MS, createEmptyDatabaseUri } from './test-database.js';
import {
  ScriptedDeadLetterArchiveWriter,
  startDeadLetterArchiverApp,
} from './dead-letter-archiver-app.js';

const POSTGRES_IMAGE = 'postgres:18';
const RABBITMQ_IMAGE = 'rabbitmq:4-management';
const HEALTH_PATH = '/api/v1/health';
const WAIT_TIMEOUT_MS = 20_000;
const WAIT_INTERVAL_MS = 25;
// Five failed attempts make one delivery's full retry run, after which the consumer pauses.
const FAILED_ATTEMPTS_BEFORE_PAUSE = 5;
// A short pause, so the test sees both the degraded and the recovered state within its timeout.
const SHORT_PAUSE_MS = 1_500;
const TIMING: DeadLetterTiming = {
  archiveRetryDelaysMs: [1, 1, 1, 1],
  consumerPauseMs: SHORT_PAUSE_MS,
};

type HealthResponse = { readonly status: number; readonly body: unknown };

async function readHealth(app: INestApplication): Promise<HealthResponse> {
  const response = await request(app.getHttpServer()).get(HEALTH_PATH);
  return { status: response.status, body: response.body as unknown };
}

// Polls the health route until it answers with the wanted status, and returns that answer.
async function waitForHealthStatus(app: INestApplication, status: number): Promise<HealthResponse> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  for (;;) {
    const health = await readHealth(app);
    if (health.status === status) {
      return health;
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for the health route to answer ${status}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
  }
}

async function waitFor(predicate: () => boolean, description: string): Promise<void> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${description}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
  }
}

describe('dead-letter archive health', () => {
  let postgres: StartedPostgreSqlContainer;
  let rabbitMq: StartedRabbitMQContainer;
  let observer: ChannelModel;
  let observerChannel: ConfirmChannel;
  const openDatabases: Database[] = [];

  beforeAll(async () => {
    [postgres, rabbitMq] = await Promise.all([
      new PostgreSqlContainer(POSTGRES_IMAGE).start(),
      new RabbitMQContainer(RABBITMQ_IMAGE).start(),
    ]);
    observer = await connect(rabbitMq.getAmqpUrl());
    observerChannel = await observer.createConfirmChannel();
  }, CONTAINER_TIMEOUT_MS);

  afterEach(async () => {
    await Promise.all(openDatabases.splice(0).map((database) => database.close()));
  });

  afterAll(async () => {
    await observer?.close();
    await rabbitMq?.stop();
    await postgres?.stop();
  }, CONTAINER_TIMEOUT_MS);

  it(
    'should answer 503 with the dead-letter check while the archive consumer is paused and 200 after it resumes',
    async () => {
      const queue = `audit.profile-changes.${randomUUID()}`;
      const databaseUrl = await createEmptyDatabaseUri(postgres.getConnectionUri());
      const database = createDatabase(databaseUrl);
      openDatabases.push(database);
      // The first delivery fails with a connection error on all five attempts, then the redelivery succeeds.
      const writer = new ScriptedDeadLetterArchiveWriter(
        new DeadLetterArchiveRepository(database),
        FAILED_ATTEMPTS_BEFORE_PAUSE,
      );
      const app = await startDeadLetterArchiverApp({
        databaseUrl,
        rabbitMqUrl: rabbitMq.getAmqpUrl(),
        queue,
        archiveWriter: writer,
        timing: TIMING,
      });
      try {
        expect((await readHealth(app)).body).toEqual({ status: 'ok' });

        observerChannel.publish('', deadLetterQueueName(queue), Buffer.from('{}', 'utf8'), {
          persistent: true,
        });
        await observerChannel.waitForConfirms();

        const degraded = await waitForHealthStatus(app, 503);
        expect(degraded.body).toEqual({
          status: 'degraded',
          checks: [{ name: 'dead-letter-archive', reason: 'DEAD_LETTER_ARCHIVE_PAUSED' }],
        });

        const recovered = await waitForHealthStatus(app, 200);
        expect(recovered.body).toEqual({ status: 'ok' });
        await waitFor(() => writer.successes === 1, 'the redelivery to commit after the pause');
      } finally {
        await app.close();
      }
    },
    TEST_TIMEOUT_MS,
  );
});
