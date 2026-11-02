import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { configureApp, parseConfig, ServiceName } from '@dexa/common';
import {
  employeeProfileUpdatedPayloadSchema,
  eventEnvelopeSchema,
  EventName,
  ProfileStatus,
  Role,
  type AccountLookupItem,
  type EmployeeProfileUpdatedPayload,
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
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import sharp from 'sharp';
import { z } from 'zod';
import { createAppModule } from '../src/app.module.js';
import {
  AUTH_ACCOUNT_CLIENT,
  type IAuthAccountClient,
} from '../src/auth-accounts/auth-account-client.interface.js';
import {
  AUTH_ACCOUNT_ADMINISTRATION_CLIENT,
  type IAuthAccountAdministrationClient,
} from '../src/auth-accounts/auth-account-administration-client.interface.js';
import { EmployeeServiceConfigSchema } from '../src/config/employee-service-config.schema.js';
import { DATABASE } from '../src/infrastructure/db/database.token.js';
import {
  employees,
  masterEmployeeStatuses,
  masterPositions,
} from '../src/infrastructure/db/schema.js';
import type { AuthKeySet } from './auth-key-set.js';
import { signGatewayUserToken } from './gateway-user-token.js';
import {
  employeeServiceAuthKeys,
  employeeServiceEnvironment,
} from './employee-service-environment.js';

// Same images as compose.yaml, so the broker and database versions match what the services run against.
const POSTGRES_IMAGE = 'postgres:18';
const RABBITMQ_IMAGE = 'rabbitmq:4-management';
const CONTAINER_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 60_000;
const WAIT_TIMEOUT_MS = 15_000;
const WAIT_INTERVAL_MS = 50;
// The events exchange name from libs/messaging (EVENTS_EXCHANGE). The library does not export it, so the test names it.
const EVENTS_EXCHANGE = 'app.events';
const OWN_PROFILE_PATH = '/api/v1/employees/me';
const OWN_PHOTO_PATH = '/api/v1/employees/me/photo';
const PHONE_NUMBER = '+6281234567890';
const RESET_PASSWORD = 'Reset-Secret-4';
const INTERNAL_ERROR_STATUS = 500;

const SEED_DOCUMENT = {
  positions: [
    { code: 'HR_OFFICER', name: 'HR Officer' },
    { code: 'FULLSTACK_DEVELOPER', name: 'Fullstack Developer' },
  ],
  employeeStatuses: [
    { code: 'ACTIVE', name: 'Active' },
    { code: 'INACTIVE', name: 'Inactive' },
  ],
};

// The broker body is Nest's { pattern, data } envelope, with the event as data (libs/messaging, buildEventRecord).
const brokerRecordSchema = z.object({ data: eventEnvelopeSchema });

type ReceivedEvent = {
  readonly eventId: string;
  readonly routingKey: string;
  readonly payload: EmployeeProfileUpdatedPayload;
};

type OutboxRow = typeof outboxEvents.$inferSelect;
type AmqpConnection = Awaited<ReturnType<typeof connect>>;

// Stands in for auth-service, which owns the accounts. An unknown ID has no status and no directory entry.
const accountDirectory = new Map<string, AccountLookupItem>();
const fakeAuthAccountClient: IAuthAccountClient = {
  findAccountById: (accountId) => Promise.resolve(accountDirectory.get(accountId)),
  lookupAccounts: (accountIds) =>
    Promise.resolve(accountIds.flatMap((accountId) => accountDirectory.get(accountId) ?? [])),
  searchAccountIdsByEmail: () => Promise.reject(new Error('These specs do not search accounts.')),
  findAccountReferenceByEmail: () => Promise.resolve(undefined),
};
// Auth applies the reset and writes its own event. This service's event is not involved in a password reset.
const fakeAdministrationClient: IAuthAccountAdministrationClient = {
  resetPassword: () => Promise.resolve(),
  setActiveStatus: () => Promise.reject(new Error('These specs do not change the active status.')),
};

/** Stages the outbox row in the caller's transaction, then fails once, so the rollback must remove both writes. */
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
    throw new Error('Simulated failure after the outbox row was staged.');
  }
}

// Signs the token that api-gateway sends to this service for the user.
function signUserToken(keys: AuthKeySet, accountId: string, role: Role): string {
  return signGatewayUserToken(keys, ServiceName.EMPLOYEE_SERVICE, accountId, role);
}

function uniqueEmail(label: string): string {
  return `${label}.${randomUUID().slice(0, 8)}@dexa.test`;
}

function readReceivedEvent(message: GetMessage): ReceivedEvent {
  const { data } = brokerRecordSchema.parse(JSON.parse(message.content.toString('utf8')));
  if (message.properties.messageId !== data.eventId) {
    throw new Error('The AMQP message ID does not match the event ID.');
  }
  return {
    eventId: data.eventId,
    routingKey: message.fields.routingKey,
    payload: employeeProfileUpdatedPayloadSchema.parse(data.payload),
  };
}

describe('employee-service profile change events', () => {
  let postgres: StartedPostgreSqlContainer;
  let rabbitMq: StartedRabbitMQContainer;
  let connection: AmqpConnection;
  let channel: Channel;
  let app: INestApplication;
  let database: Database;
  let keys: AuthKeySet;
  const runningApplications: INestApplication[] = [];

  beforeAll(async () => {
    [postgres, rabbitMq] = await Promise.all([
      new PostgreSqlContainer(POSTGRES_IMAGE).start(),
      new RabbitMQContainer(RABBITMQ_IMAGE).start(),
    ]);
    connection = await connect(rabbitMq.getAmqpUrl());
    channel = await connection.createChannel();
    keys = employeeServiceAuthKeys();
    ({ app, database } = await startApplication());
  }, CONTAINER_TIMEOUT_MS);

  afterAll(async () => {
    await Promise.all(runningApplications.map((running) => running.close()));
    await connection?.close();
    await Promise.all([postgres?.stop(), rabbitMq?.stop()]);
  }, CONTAINER_TIMEOUT_MS);

  async function startApplication(
    outboxWriter?: IOutboxWriter,
  ): Promise<{ app: INestApplication; database: Database }> {
    const config = parseConfig(
      EmployeeServiceConfigSchema,
      employeeServiceEnvironment({
        EMPLOYEE_DATABASE_URL: postgres.getConnectionUri(),
        RABBITMQ_URL: rabbitMq.getAmqpUrl(),
        EMPLOYEE_MASTER_DATA: JSON.stringify(SEED_DOCUMENT),
      }),
    );
    let builder = Test.createTestingModule({ imports: [createAppModule(config)] })
      .overrideProvider(AUTH_ACCOUNT_CLIENT)
      .useValue(fakeAuthAccountClient)
      .overrideProvider(AUTH_ACCOUNT_ADMINISTRATION_CLIENT)
      .useValue(fakeAdministrationClient);
    if (outboxWriter !== undefined) {
      builder = builder.overrideProvider(OUTBOX_WRITER).useValue(outboxWriter);
    }
    const moduleRef = await builder.compile();
    const started = moduleRef.createNestApplication();
    configureApp(started, { CORS_ORIGINS: [] });
    await started.init();
    runningApplications.push(started);
    return { app: started, database: moduleRef.get<Database>(DATABASE) };
  }

  // A durable queue bound to the event type. Each test binds its own queue, so it reads only its own messages.
  async function bindEventQueue(): Promise<string> {
    const queue = `employee-service.profile-events-test.${randomUUID()}`;
    await channel.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true });
    await channel.assertQueue(queue, { durable: true });
    await channel.bindQueue(queue, EVENTS_EXCHANGE, EventName.EMPLOYEE_PROFILE_UPDATED);
    return queue;
  }

  // The relay polls every 500 ms, so the message arrives after the request returns. The wait is bounded.
  async function waitForNextEvent(queue: string): Promise<ReceivedEvent> {
    const deadline = Date.now() + WAIT_TIMEOUT_MS;
    for (;;) {
      const message = await channel.get(queue, { noAck: true });
      if (message !== false) return readReceivedEvent(message);
      if (Date.now() >= deadline) throw new Error(`No event reached ${queue} before the deadline.`);
      await delay(WAIT_INTERVAL_MS);
    }
  }

  async function readOutboxRowsForAccount(accountId: string): Promise<OutboxRow[]> {
    return database.db
      .select()
      .from(outboxEvents)
      .where(sql`${outboxEvents.payload} -> 'payload' ->> 'accountId' = ${accountId}`);
  }

  async function readStoredProfile(accountId: string) {
    const [row] = await database.db
      .select({ phoneNumber: employees.phoneNumber, profileStatus: employees.profileStatus })
      .from(employees)
      .where(eq(employees.accountId, accountId));
    if (row === undefined) throw new Error('The test employee has no profile row.');
    return row;
  }

  // Inserts an account with a user token and a profile row. The profile starts incomplete unless a photo is given.
  async function createEmployee(options: {
    readonly name: string;
    readonly role?: Role;
    readonly positionCode?: string;
    readonly phoneNumber?: string | null;
  }): Promise<{ readonly accountId: string; readonly token: string }> {
    const role = options.role ?? Role.EMPLOYEE;
    const accountId = randomUUID();
    accountDirectory.set(accountId, { id: accountId, email: uniqueEmail('employee'), role });
    const [position] = await database.db
      .select({ id: masterPositions.id })
      .from(masterPositions)
      .where(eq(masterPositions.code, options.positionCode ?? 'FULLSTACK_DEVELOPER'));
    const [status] = await database.db
      .select({ id: masterEmployeeStatuses.id })
      .from(masterEmployeeStatuses)
      .where(eq(masterEmployeeStatuses.code, 'ACTIVE'));
    if (position === undefined || status === undefined) {
      throw new Error('The master seed did not insert the rows this test needs.');
    }
    await database.db.insert(employees).values({
      accountId,
      name: options.name,
      positionId: position.id,
      employeeStatusId: status.id,
      profileStatus: ProfileStatus.INCOMPLETE,
      phoneNumber: options.phoneNumber ?? null,
      photoKey: null,
    });
    return { accountId, token: signUserToken(keys, accountId, role) };
  }

  function patchOwnPhone(application: INestApplication, token: string) {
    return request(application.getHttpServer())
      .patch(OWN_PROFILE_PATH)
      .set('Authorization', `Bearer ${token}`)
      .send({ phoneNumber: PHONE_NUMBER });
  }

  function putOwnPhoto(application: INestApplication, token: string, photo: Buffer) {
    return request(application.getHttpServer())
      .put(OWN_PHOTO_PATH)
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', photo, 'photo.jpg');
  }

  function patchEmployee(accountId: string, token: string, body: object) {
    return request(app.getHttpServer())
      .patch(`/api/v1/employees/${accountId}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  it(
    'should publish one event for the phone change and one for the photo change, in request order',
    async () => {
      const queue = await bindEventQueue();
      const employee = await createEmployee({ name: 'Nadia Rahma' });
      const photo = await sharp({
        create: { width: 64, height: 64, channels: 3, background: '#2d6a4f' },
      })
        .jpeg()
        .toBuffer();

      await patchOwnPhone(app, employee.token).expect(200);
      const phoneEvent = await waitForNextEvent(queue);
      await putOwnPhoto(app, employee.token, photo).expect(200);
      const photoEvent = await waitForNextEvent(queue);

      expect(phoneEvent.routingKey).toBe(EventName.EMPLOYEE_PROFILE_UPDATED);
      expect(phoneEvent.payload).toEqual({
        accountId: employee.accountId,
        actorAccountId: employee.accountId,
        employeeName: 'Nadia Rahma',
        changedFields: ['phoneNumber'],
      });
      // The photo completes the profile, so its status change is reported with the photo.
      expect(photoEvent.payload).toEqual({
        accountId: employee.accountId,
        actorAccountId: employee.accountId,
        employeeName: 'Nadia Rahma',
        changedFields: ['photo', 'profileStatus'],
      });
      expect(photoEvent.eventId).not.toBe(phoneEvent.eventId);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should publish nothing when the phone is sent unchanged',
    async () => {
      const queue = await bindEventQueue();
      const employee = await createEmployee({ name: 'Bima Saputra', phoneNumber: PHONE_NUMBER });

      await patchOwnPhone(app, employee.token).expect(200);

      expect(await readOutboxRowsForAccount(employee.accountId)).toEqual([]);
      // A real change follows. Events publish in creation order, so the first message must be this change.
      const photo = await sharp({
        create: { width: 64, height: 64, channels: 3, background: '#2d6a4f' },
      })
        .jpeg()
        .toBuffer();
      await putOwnPhoto(app, employee.token, photo).expect(200);
      const nextEvent = await waitForNextEvent(queue);
      expect(nextEvent.payload.changedFields).toEqual(['photo', 'profileStatus']);
      expect(nextEvent.payload.accountId).toBe(employee.accountId);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should publish one event naming HR as the actor when HR changes the name',
    async () => {
      const queue = await bindEventQueue();
      const hr = await createEmployee({
        name: 'Sari Lestari',
        role: Role.HR,
        positionCode: 'HR_OFFICER',
      });
      const target = await createEmployee({ name: 'Dewi Anggraini' });

      await patchEmployee(target.accountId, hr.token, { name: 'Dewi Anggraeni' }).expect(200);

      const event = await waitForNextEvent(queue);
      expect(event.payload).toEqual({
        accountId: target.accountId,
        actorAccountId: hr.accountId,
        employeeName: 'Dewi Anggraeni',
        changedFields: ['name'],
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should publish nothing and keep the password out of the outbox when HR resets only the password',
    async () => {
      const queue = await bindEventQueue();
      const hr = await createEmployee({
        name: 'Sari Lestari',
        role: Role.HR,
        positionCode: 'HR_OFFICER',
      });
      const target = await createEmployee({ name: 'Rina Hartati' });

      await patchEmployee(target.accountId, hr.token, { newPassword: RESET_PASSWORD }).expect(200);

      const rows = await readOutboxRowsForAccount(target.accountId);
      expect(rows).toEqual([]);
      // Auth publishes account.password.changed for a reset, so this service sends nothing for it.
      await patchEmployee(target.accountId, hr.token, { name: 'Rina Hartati Putri' }).expect(200);
      const event = await waitForNextEvent(queue);
      expect(event.payload.changedFields).toEqual(['name']);
      expect(JSON.stringify(event)).not.toContain(RESET_PASSWORD);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should publish nothing when the phone change rolls back, and publish once when it is retried',
    async () => {
      const queue = await bindEventQueue();
      const failing = await startApplication(new FailOnceAfterStagingOutboxWriter());
      const employee = await createEmployee({ name: 'Yoga Pratama' });

      await patchOwnPhone(failing.app, employee.token).expect(INTERNAL_ERROR_STATUS);

      expect(await readStoredProfile(employee.accountId)).toEqual({
        phoneNumber: null,
        profileStatus: ProfileStatus.INCOMPLETE,
      });
      expect(await readOutboxRowsForAccount(employee.accountId)).toEqual([]);

      await patchOwnPhone(failing.app, employee.token).expect(200);
      const event = await waitForNextEvent(queue);
      expect(event.payload.changedFields).toEqual(['phoneNumber']);
      expect(await readOutboxRowsForAccount(employee.accountId)).toHaveLength(1);
    },
    TEST_TIMEOUT_MS,
  );
});
