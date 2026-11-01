import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { CLOCK, configureApp, parseConfig, ServiceName, type IClock } from '@dexa/common';
import {
  attendanceRequestEventPayloadSchema,
  eventEnvelopeSchema,
  EventName,
  Role,
  type AttendanceRequestEventPayload,
} from '@dexa/contracts';
import type { Database } from '@dexa/db';
import {
  OUTBOX_WRITER,
  outboxEvents,
  type EventMessage,
  type IOutboxWriter,
  type OutboxTransaction,
} from '@dexa/messaging';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RabbitMQContainer, type StartedRabbitMQContainer } from '@testcontainers/rabbitmq';
import { connect, type Channel, type GetMessage } from 'amqplib';
import request from 'supertest';
import { z } from 'zod';
import { createAppModule } from '../src/app.module.js';
import { AttendanceServiceConfigSchema } from '../src/config/attendance-service-config.schema.js';
import { DATABASE } from '../src/infrastructure/db/database.token.js';
import type { AuthKeySet } from './auth-key-set.js';
import { signGatewayUserToken } from './gateway-user-token.js';
import {
  attendanceServiceAuthKeys,
  attendanceServiceEnvironment,
} from './attendance-service-environment.js';
import { CONTAINER_TIMEOUT_MS, TEST_TIMEOUT_MS, createEmptyDatabaseUri } from './test-database.js';

const POSTGRES_IMAGE = 'postgres:18';
const RABBITMQ_IMAGE = 'rabbitmq:4-management';
const WAIT_TIMEOUT_MS = 15_000;
const WAIT_INTERVAL_MS = 50;
const EVENTS_EXCHANGE = 'app.events';
const SUBMIT_OVERTIME_PATH = '/api/v1/overtime-requests';
const SUBMIT_CORRECTION_PATH = '/api/v1/attendance-corrections';
const TOKEN_LIFETIME_SECONDS = 60;
const WORKING_DATE = '2026-11-02';
const FIRST_START_INSTANT = new Date('2026-11-02T11:00:00Z');

const brokerRecordSchema = z.object({ data: eventEnvelopeSchema });

type ReceivedEvent = {
  readonly eventId: string;
  readonly routingKey: string;
  readonly payload: AttendanceRequestEventPayload;
};

type OutboxRow = typeof outboxEvents.$inferSelect;
type AmqpConnection = Awaited<ReturnType<typeof connect>>;

const mutableClock: { current: Date } = { current: FIRST_START_INSTANT };
const fixedClock: IClock = { now: () => new Date(mutableClock.current) };

let postgres: StartedPostgreSqlContainer;
let rabbitmq: StartedRabbitMQContainer;
let app: INestApplication;
let database: Database;
let broker: AmqpConnection;
let channel: Channel;
let keys: AuthKeySet;
let databaseUrl: string;
let brokerUrl: string;

function tokenFor(accountId: string, role: Role = Role.EMPLOYEE): string {
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECONDS;
  return signGatewayUserToken(keys, ServiceName.ATTENDANCE_SERVICE, accountId, role, expiresAt);
}

class FailOnceAfterStagingOutboxWriter implements IOutboxWriter {
  private hasFailed = false;

  async add(transaction: OutboxTransaction, event: EventMessage): Promise<void> {
    await transaction.insert(outboxEvents).values({
      id: event.eventId,
      eventType: event.type,
      payload: event,
      occurredAt: new Date(event.occurredAt),
    });
    if (this.hasFailed) return;
    this.hasFailed = true;
    throw new Error('Simulated failure right after staging the outbox event.');
  }
}

async function bindEventQueue(): Promise<string> {
  const queueName = `test.attendance.requests.${randomUUID()}`;
  await channel.assertQueue(queueName, { exclusive: true, autoDelete: true });
  await channel.bindQueue(queueName, EVENTS_EXCHANGE, 'attendance.request.*');
  return queueName;
}

async function waitForNextEvent(queueName: string): Promise<ReceivedEvent> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const message: GetMessage | false = await channel.get(queueName, { noAck: true });
    if (message !== false) {
      const parsed = JSON.parse(message.content.toString('utf8')) as unknown;
      const record = brokerRecordSchema.parse(parsed);
      const payload = attendanceRequestEventPayloadSchema.parse(record.data.payload);
      return {
        eventId: record.data.eventId,
        routingKey: message.fields.routingKey,
        payload,
      };
    }
    await delay(WAIT_INTERVAL_MS);
  }
  throw new Error(`No event arrived on queue ${queueName} within ${WAIT_TIMEOUT_MS}ms.`);
}

async function readOutboxRows(): Promise<OutboxRow[]> {
  return database.db.select().from(outboxEvents);
}

async function startApplication(customWriter?: IOutboxWriter): Promise<{
  app: INestApplication;
  database: Database;
}> {
  const config = parseConfig(
    AttendanceServiceConfigSchema,
    attendanceServiceEnvironment({
      ATTENDANCE_DATABASE_URL: databaseUrl,
      RABBITMQ_URL: brokerUrl,
    }),
  );
  let builder = Test.createTestingModule({ imports: [createAppModule(config)] })
    .overrideProvider(CLOCK)
    .useValue(fixedClock);
  if (customWriter !== undefined) {
    builder = builder.overrideProvider(OUTBOX_WRITER).useValue(customWriter);
  }
  const moduleRef = await builder.compile();
  const nestApp = moduleRef.createNestApplication();
  configureApp(nestApp, { CORS_ORIGINS: [] });
  await nestApp.init();
  const db = moduleRef.get<Database>(DATABASE);
  return { app: nestApp, database: db };
}

describe('request events outbox integration', () => {
  beforeAll(async () => {
    keys = attendanceServiceAuthKeys();
    [postgres, rabbitmq] = await Promise.all([
      new PostgreSqlContainer(POSTGRES_IMAGE).start(),
      new RabbitMQContainer(RABBITMQ_IMAGE).start(),
    ]);
    databaseUrl = await createEmptyDatabaseUri(postgres.getConnectionUri());
    brokerUrl = rabbitmq.getAmqpUrl();

    broker = await connect(brokerUrl);
    channel = await broker.createChannel();
    await channel.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true });

    const started = await startApplication();
    app = started.app;
    database = started.database;
  }, CONTAINER_TIMEOUT_MS);

  afterAll(async () => {
    await app?.close();
    await channel?.close();
    await broker?.close();
    await Promise.all([postgres?.stop(), rabbitmq?.stop()]);
  }, CONTAINER_TIMEOUT_MS);

  it(
    'should publish attendance.request.submitted when overtime is requested, and nothing on replay',
    async () => {
      const queue = await bindEventQueue();
      const accountId = randomUUID();
      const token = tokenFor(accountId);
      const idempotencyKey = randomUUID();

      const body = {
        businessDate: WORKING_DATE,
        startAt: '2026-11-02T18:00:00+07:00',
        endAt: '2026-11-02T20:00:00+07:00',
        reason: 'Deploying release',
        idempotencyKey,
      };

      const res = await request(app.getHttpServer())
        .post(SUBMIT_OVERTIME_PATH)
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(201);

      const event = await waitForNextEvent(queue);
      expect(event.routingKey).toBe(EventName.ATTENDANCE_REQUEST_SUBMITTED);
      expect(event.payload).toEqual({
        accountId,
        actorAccountId: accountId,
        resourceType: 'overtime_request',
        resourceId: res.body.id,
        businessDate: WORKING_DATE,
        changedFields: [],
      });

      // Replay with identical body
      const replayRes = await request(app.getHttpServer())
        .post(SUBMIT_OVERTIME_PATH)
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(200);

      expect(replayRes.body.id).toBe(res.body.id);
      // Wait a short time to verify no second event was sent
      await delay(200);
      const checkMessage = await channel.get(queue, { noAck: true });
      expect(checkMessage).toBe(false);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should publish attendance.request.submitted when correction is requested',
    async () => {
      const queue = await bindEventQueue();
      const accountId = randomUUID();
      const token = tokenFor(accountId);

      const body = {
        businessDate: WORKING_DATE,
        requestedDayStatus: 'PRESENT',
        clockInAt: '2026-11-02T09:00:00+07:00',
        clockOutAt: '2026-11-02T18:00:00+07:00',
        reason: 'Badge forgot',
        idempotencyKey: randomUUID(),
      };

      const res = await request(app.getHttpServer())
        .post(SUBMIT_CORRECTION_PATH)
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(201);

      const event = await waitForNextEvent(queue);
      expect(event.routingKey).toBe(EventName.ATTENDANCE_REQUEST_SUBMITTED);
      expect(event.payload).toEqual({
        accountId,
        actorAccountId: accountId,
        resourceType: 'attendance_adjustment_request',
        resourceId: res.body.id,
        businessDate: WORKING_DATE,
        changedFields: [],
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should publish attendance.request.approved and attendance.request.rejected on HR decision',
    async () => {
      const queue = await bindEventQueue();
      const requesterId = randomUUID();
      const hrId = randomUUID();
      const userToken = tokenFor(requesterId);
      const hrToken = tokenFor(hrId, Role.HR);

      // Submit overtime
      const submitRes = await request(app.getHttpServer())
        .post(SUBMIT_OVERTIME_PATH)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          businessDate: '2026-11-03',
          startAt: '2026-11-03T18:00:00+07:00',
          endAt: '2026-11-03T19:00:00+07:00',
          reason: 'Emergency fix',
          idempotencyKey: randomUUID(),
        })
        .expect(201);

      await waitForNextEvent(queue); // drain submit event

      // Approve overtime
      await request(app.getHttpServer())
        .post(`/api/v1/overtime-requests/${submitRes.body.id}/approve`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ reviewReason: 'Approved for urgent fix' })
        .expect(200);

      const approveEvent = await waitForNextEvent(queue);
      expect(approveEvent.routingKey).toBe(EventName.ATTENDANCE_REQUEST_APPROVED);
      expect(approveEvent.payload).toEqual({
        accountId: requesterId,
        actorAccountId: hrId,
        resourceType: 'overtime_request',
        resourceId: submitRes.body.id,
        businessDate: '2026-11-03',
        changedFields: [],
      });

      // Submit correction
      const corrRes = await request(app.getHttpServer())
        .post(SUBMIT_CORRECTION_PATH)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          businessDate: '2026-11-04',
          requestedDayStatus: 'LEAVE',
          reason: 'Annual leave',
          idempotencyKey: randomUUID(),
        })
        .expect(201);

      await waitForNextEvent(queue); // drain submit event

      // Reject correction
      await request(app.getHttpServer())
        .post(`/api/v1/attendance-corrections/${corrRes.body.id}/reject`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ reviewReason: 'Leave quota exhausted' })
        .expect(200);

      const rejectEvent = await waitForNextEvent(queue);
      expect(rejectEvent.routingKey).toBe(EventName.ATTENDANCE_REQUEST_REJECTED);
      expect(rejectEvent.payload).toEqual({
        accountId: requesterId,
        actorAccountId: hrId,
        resourceType: 'attendance_adjustment_request',
        resourceId: corrRes.body.id,
        businessDate: '2026-11-04',
        changedFields: [],
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should publish nothing when submission transaction fails and rolls back',
    async () => {
      const failing = await startApplication(new FailOnceAfterStagingOutboxWriter());
      const accountId = randomUUID();
      const token = tokenFor(accountId);

      await request(failing.app.getHttpServer())
        .post(SUBMIT_OVERTIME_PATH)
        .set('Authorization', `Bearer ${token}`)
        .send({
          businessDate: '2026-11-05',
          startAt: '2026-11-05T18:00:00+07:00',
          endAt: '2026-11-05T19:00:00+07:00',
          reason: 'Failing write',
          idempotencyKey: randomUUID(),
        })
        .expect(500);

      await failing.app.close();

      const outbox = await readOutboxRows();
      expect(
        outbox.some(
          (row) =>
            (row.payload as { payload?: { businessDate?: string } })?.payload?.businessDate ===
            '2026-11-05',
        ),
      ).toBe(false);
    },
    TEST_TIMEOUT_MS,
  );
});
