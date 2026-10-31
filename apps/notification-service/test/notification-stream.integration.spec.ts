import type { INestApplication } from '@nestjs/common';
import { notificationSchema, EventName, Role, type Notification } from '@dexa/contracts';
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
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { NotificationRepository } from '../src/ingestion/notification.repository.js';
import { notifications } from '../src/infrastructure/db/schema.js';
import { NotificationHub } from '../src/stream/notification-hub.js';
import { CONTAINER_TIMEOUT_MS, TEST_TIMEOUT_MS, createEmptyDatabaseUri } from './test-database.js';
import { startNotificationConsumerApp } from './notification-consumer-app.js';
import { notificationServiceAuthKeys } from './notification-service-environment.js';
import {
  CountingNotificationWriter,
  ScriptedAccountStatusReader,
  ScriptedAuthClient,
  ScriptedEmployeeClient,
} from './scripted-clients.js';
import { SseFrameReader, type SseFrame } from './sse-frame-reader.js';
import { signUserAccessToken } from './user-access-token.js';

// Same images as compose.yaml, so the tests run against the broker and database versions the services use.
const POSTGRES_IMAGE = 'postgres:18';
const RABBITMQ_IMAGE = 'rabbitmq:4-management';
const STREAM_PATH = '/api/v1/notifications/stream';
// A short heartbeat lets the specs observe heartbeats and a deactivation within a fraction of a second.
const HEARTBEAT_MILLISECONDS = 100;
// The popup must appear within about 2 seconds of the change (PRD §8).
const POPUP_BUDGET_MILLISECONDS = 2_000;
const WAIT_TIMEOUT_MS = 10_000;
const WAIT_INTERVAL_MS = 25;
const OCCURRED_AT = '2026-10-30T02:05:00.000Z';
const SUBJECT_ACCOUNT_ID = '5b7e2c1a-9f3d-4e6b-8a2c-1d0e9f8a7b6c';
const ACTOR_ACCOUNT_ID = '2c9d4f7e-1a3b-4c5d-9e8f-0a1b2c3d4e5f';
const EMPLOYEE_NAME = 'Budi Santoso';
const HR_RECIPIENT_A = '1f2e3d4c-5b6a-4789-8abc-0d1e2f3a4b5c';
const HR_RECIPIENT_B = '3b4c5d6e-7f80-4912-8bcd-2e3f4a5b6c7d';
// An active HR account that is not a recipient of the event. Its stream must stay silent.
const HR_NOT_RECIPIENT = '7d8e9f0a-1b2c-4d3e-8f4a-5b6c7d8e9f0a';
const HR_DEACTIVATED = '9a0b1c2d-3e4f-4a5b-9c6d-7e8f9a0b1c2d';
const EMPLOYEE_ACCOUNT = '4e5f6a7b-8c9d-4e0f-8a1b-2c3d4e5f6a7b';

type ConnectedStream = {
  readonly frames: SseFrameReader;
  readonly disconnect: () => void;
};

function profileUpdatedEvent(): EventMessage {
  return {
    eventId: randomUUID(),
    type: EventName.EMPLOYEE_PROFILE_UPDATED,
    occurredAt: OCCURRED_AT,
    payload: {
      accountId: SUBJECT_ACCOUNT_ID,
      actorAccountId: ACTOR_ACCOUNT_ID,
      employeeName: EMPLOYEE_NAME,
      changedFields: ['phoneNumber'],
    },
  };
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

// Skips heartbeats until the stream sends a notification, and checks the payload against the contract.
async function nextNotification(frames: SseFrameReader): Promise<Notification> {
  for (;;) {
    const frame = await frames.nextFrame();
    if (frame === undefined) throw new Error('The stream ended before a notification arrived.');
    if (frame.kind === 'notification') return notificationSchema.parse(frame.data);
  }
}

// Reads frames until the given number of heartbeats has passed, and returns everything read on the way.
async function framesUntilHeartbeats(
  frames: SseFrameReader,
  heartbeats: number,
): Promise<SseFrame[]> {
  const read: SseFrame[] = [];
  let seenHeartbeats = 0;
  while (seenHeartbeats < heartbeats) {
    const frame = await frames.nextFrame();
    if (frame === undefined) break;
    read.push(frame);
    if (frame.kind === 'heartbeat') seenHeartbeats += 1;
  }
  return read;
}

describe('HR notification stream on the running service', () => {
  let postgres: StartedPostgreSqlContainer;
  let rabbitMq: StartedRabbitMQContainer;
  let publisherModule: TestingModule;
  let publisher: IEventPublisher;
  let app: INestApplication;
  let database: Database;
  let writer: CountingNotificationWriter;
  let baseUrl: string;
  const accountStatuses = new ScriptedAccountStatusReader();
  const openedStreams: ConnectedStream[] = [];
  const keys = notificationServiceAuthKeys();

  function tokenFor(accountId: string, role: Role = Role.HR): string {
    return signUserAccessToken(keys, accountId, role);
  }

  async function requestStream(accessToken?: string): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'text/event-stream' };
    if (accessToken !== undefined) headers.Authorization = `Bearer ${accessToken}`;
    return fetch(`${baseUrl}${STREAM_PATH}`, { headers });
  }

  async function connectStream(accessToken: string): Promise<ConnectedStream> {
    const controller = new AbortController();
    const response = await fetch(`${baseUrl}${STREAM_PATH}`, {
      headers: { Accept: 'text/event-stream', Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    if (response.status !== 200 || response.body === null) {
      throw new Error(`The stream answered HTTP ${response.status} instead of opening.`);
    }
    const stream: ConnectedStream = {
      frames: new SseFrameReader(response.body),
      disconnect: () => controller.abort(),
    };
    openedStreams.push(stream);
    return stream;
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

    for (const accountId of [HR_RECIPIENT_A, HR_RECIPIENT_B, HR_NOT_RECIPIENT, HR_DEACTIVATED]) {
      accountStatuses.setActive(accountId, true);
    }
    accountStatuses.setActive(EMPLOYEE_ACCOUNT, true);

    const databaseUrl = await createEmptyDatabaseUri(postgres.getConnectionUri());
    // The pool opens no connection until it is used, so it can exist before the app migrates the database.
    database = createDatabase(databaseUrl);
    writer = new CountingNotificationWriter(new NotificationRepository(database));
    app = await startNotificationConsumerApp({
      databaseUrl,
      rabbitMqUrl: rabbitMq.getAmqpUrl(),
      queue: `hr.notifications.${randomUUID()}`,
      authClient: new ScriptedAuthClient([HR_RECIPIENT_A, HR_RECIPIENT_B], 0),
      employeeClient: new ScriptedEmployeeClient([], 0),
      notificationWriter: writer,
      accountStatusReader: accountStatuses,
      heartbeatMilliseconds: HEARTBEAT_MILLISECONDS,
    });
    baseUrl = await app.getUrl();
  }, CONTAINER_TIMEOUT_MS);

  afterEach(async () => {
    for (const stream of openedStreams.splice(0)) {
      stream.disconnect();
      await stream.frames.cancel();
    }
  });

  afterAll(async () => {
    await app?.close();
    await database?.close();
    await publisherModule?.close();
    await rabbitMq?.stop();
    await postgres?.stop();
  }, CONTAINER_TIMEOUT_MS);

  describe('delivery to HR accounts', () => {
    it(
      'should deliver each recipient only its own inbox row, within the popup budget',
      async () => {
        const recipientA = await connectStream(tokenFor(HR_RECIPIENT_A));
        const recipientB = await connectStream(tokenFor(HR_RECIPIENT_B));
        const notRecipient = await connectStream(tokenFor(HR_NOT_RECIPIENT));
        const event = profileUpdatedEvent();

        const publishedAt = performance.now();
        await publisher.publish(event);
        const pushedToA = await nextNotification(recipientA.frames);
        const elapsedMilliseconds = performance.now() - publishedAt;
        const pushedToB = await nextNotification(recipientB.frames);

        const rows = await database.db
          .select()
          .from(notifications)
          .where(eq(notifications.eventId, event.eventId));
        const rowIdFor = (recipientAccountId: string) =>
          rows.find((row) => row.recipientAccountId === recipientAccountId)?.id;
        expect(pushedToA.id).toBe(rowIdFor(HR_RECIPIENT_A));
        expect(pushedToB.id).toBe(rowIdFor(HR_RECIPIENT_B));
        expect(pushedToA.id).not.toBe(pushedToB.id);
        expect(pushedToA).toMatchObject({
          eventType: 'employee.profile.updated',
          title: 'Budi Santoso updated: phone number',
          body: 'Changed fields: phone number.',
          data: { changedFields: ['phoneNumber'] },
          occurredAt: OCCURRED_AT,
          readAt: null,
        });
        expect(elapsedMilliseconds).toBeLessThan(POPUP_BUDGET_MILLISECONDS);
        const seenByNonRecipient = await framesUntilHeartbeats(notRecipient.frames, 2);
        expect(seenByNonRecipient.filter((frame) => frame.kind === 'notification')).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should push one notification when the same event is delivered twice',
      async () => {
        const recipient = await connectStream(tokenFor(HR_RECIPIENT_A));
        const event = profileUpdatedEvent();

        await publisher.publish(event);
        await publisher.publish(event);

        const firstPush = await nextNotification(recipient.frames);
        await waitFor(() => writer.commits === 2, 'both deliveries to commit');
        const afterRedelivery = await framesUntilHeartbeats(recipient.frames, 2);
        expect(firstPush.eventType).toBe('employee.profile.updated');
        expect(afterRedelivery.filter((frame) => frame.kind === 'notification')).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('access', () => {
    it(
      'should answer 403 when an employee token opens the stream',
      async () => {
        const response = await requestStream(tokenFor(EMPLOYEE_ACCOUNT, Role.EMPLOYEE));

        expect(response.status).toBe(403);
        await response.body?.cancel();
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should answer 401 when no bearer token is sent',
      async () => {
        const response = await requestStream();

        expect(response.status).toBe(401);
        await response.body?.cancel();
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should answer with the event-stream headers that keep proxies from buffering',
      async () => {
        const response = await requestStream(tokenFor(HR_NOT_RECIPIENT));

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
        expect(response.headers.get('cache-control')).toBe('no-cache, no-transform');
        expect(response.headers.get('x-accel-buffering')).toBe('no');
        await response.body?.cancel();
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('heartbeat and account status', () => {
    it(
      'should close the stream at the next heartbeat when the account is deactivated',
      async () => {
        const stream = await connectStream(tokenFor(HR_DEACTIVATED));
        const firstFrame = await stream.frames.nextFrame();
        expect(firstFrame?.kind).toBe('heartbeat');

        accountStatuses.setActive(HR_DEACTIVATED, false);

        const framesUntilEnd: SseFrame[] = [];
        for (;;) {
          const frame = await stream.frames.nextFrame();
          if (frame === undefined) break;
          framesUntilEnd.push(frame);
        }
        expect(framesUntilEnd.filter((frame) => frame.kind === 'notification')).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should keep the stream open with heartbeats while the account stays active',
      async () => {
        const stream = await connectStream(tokenFor(HR_NOT_RECIPIENT));

        const frames = await framesUntilHeartbeats(stream.frames, 3);

        expect(frames.filter((frame) => frame.kind === 'heartbeat')).toHaveLength(3);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('cleanup', () => {
    it(
      'should remove the subscription when the client disconnects',
      async () => {
        const hub = app.get(NotificationHub);
        // The streams of earlier specs are closed in afterEach, but the server learns of a closed socket a moment
        // later. Waiting for an empty hub makes the baseline exact, and a leak from an earlier spec fails here.
        await waitFor(() => hub.subscriberCount() === 0, 'earlier streams to unsubscribe');
        const stream = await connectStream(tokenFor(HR_NOT_RECIPIENT));
        await waitFor(() => hub.subscriberCount() === 1, 'the stream to subscribe');

        stream.disconnect();

        await waitFor(() => hub.subscriberCount() === 0, 'the disconnected stream to unsubscribe');
      },
      TEST_TIMEOUT_MS,
    );
  });
});
