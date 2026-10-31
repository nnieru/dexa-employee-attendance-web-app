import { ServiceName, CLOCK, configureApp, parseConfig, type IClock } from '@dexa/common';
import {
  ErrorCode,
  Role,
  notificationIdParamSchema,
  notificationPageSchema,
  notificationSchema,
  notificationUnreadCountSchema,
  type Notification,
} from '@dexa/contracts';
import { createDatabase, type Database } from '@dexa/db';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createAppModule } from '../src/app.module.js';
import { NotificationServiceConfigSchema } from '../src/config/notification-service-config.schema.js';
import { notifications } from '../src/infrastructure/db/schema.js';
import { CONTAINER_TIMEOUT_MS, TEST_TIMEOUT_MS, createEmptyDatabaseUri } from './test-database.js';
import {
  notificationServiceAuthKeys,
  notificationServiceEnvironment,
} from './notification-service-environment.js';
import { signEndUserJwt, signGatewayUserToken } from './gateway-user-token.js';

// Same image as compose.yaml, so the tests run against the database version the service uses.
const POSTGRES_IMAGE = 'postgres:18';
const INBOX_PATH = '/api/v1/notifications';
const UNREAD_COUNT_PATH = `${INBOX_PATH}/unread-count`;
const readPath = (id: string) => `${INBOX_PATH}/${id}/read`;
const OCCURRED_AT = new Date('2026-10-30T02:05:00.000Z');
const FIRST_READ_AT = new Date('2026-10-31T01:00:00.000Z');
const LATER_READ_AT = new Date('2026-10-31T05:00:00.000Z');
const HR_ME = '1f2e3d4c-5b6a-4789-8abc-0d1e2f3a4b5c';
const HR_OTHER = '3b4c5d6e-7f80-4912-8bcd-2e3f4a5b6c7d';
const EMPLOYEE_ACCOUNT = '4e5f6a7b-8c9d-4e0f-8a1b-2c3d4e5f6a7b';

// The clock is the only time source, so a test moves it to show what the server stamps.
class AdjustableClock implements IClock {
  private current = FIRST_READ_AT;

  now(): Date {
    return this.current;
  }

  set(instant: Date): void {
    this.current = instant;
  }
}

function minutesAfter(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60_000);
}

// Newest first by created_at, then by id, the order the history index serves (DATABASE §7.1).
function newestFirst(
  rows: ReadonlyArray<{ readonly id: string; readonly createdAt: Date }>,
): string[] {
  return [...rows]
    .sort((left, right) => {
      if (left.createdAt.getTime() !== right.createdAt.getTime()) {
        return right.createdAt.getTime() - left.createdAt.getTime();
      }
      return right.id < left.id ? -1 : 1;
    })
    .map((row) => row.id);
}

describe('HR inbox on the running service', () => {
  let postgres: StartedPostgreSqlContainer;
  let database: Database;
  let app: INestApplication;
  let clock: AdjustableClock;
  const keys = notificationServiceAuthKeys();

  function tokenFor(accountId: string, role: Role = Role.HR): string {
    return signGatewayUserToken(keys, ServiceName.NOTIFICATION_SERVICE, accountId, role);
  }

  async function seed(options: {
    readonly recipientAccountId: string;
    readonly createdAt: Date;
    readonly readAt?: Date;
  }): Promise<{ readonly id: string; readonly createdAt: Date }> {
    const [row] = await database.db
      .insert(notifications)
      .values({
        eventId: randomUUID(),
        eventType: 'employee.profile.updated',
        recipientAccountId: options.recipientAccountId,
        subjectAccountId: EMPLOYEE_ACCOUNT,
        actorAccountId: HR_ME,
        title: 'Budi Santoso updated: phone number',
        body: 'Changed fields: phone number.',
        data: { changedFields: ['phoneNumber'] },
        occurredAt: OCCURRED_AT,
        createdAt: options.createdAt,
        readAt: options.readAt ?? null,
      })
      .returning({ id: notifications.id });
    if (row === undefined) throw new Error('The insert returned no row.');
    return { id: row.id, createdAt: options.createdAt };
  }

  async function readStoredReadAt(id: string): Promise<Date | null> {
    const [row] = await database.db
      .select({ readAt: notifications.readAt })
      .from(notifications)
      .where(eq(notifications.id, id));
    if (row === undefined) throw new Error('The seeded row is missing.');
    return row.readAt;
  }

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
    const databaseUrl = await createEmptyDatabaseUri(postgres.getConnectionUri());
    const config = parseConfig(
      NotificationServiceConfigSchema,
      notificationServiceEnvironment({ NOTIFICATION_DATABASE_URL: databaseUrl }),
    );
    clock = new AdjustableClock();
    const moduleRef = await Test.createTestingModule({
      imports: [createAppModule(config)],
    })
      .overrideProvider(CLOCK)
      .useValue(clock)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app, { CORS_ORIGINS: [] });
    // The app migrates the database on init, so the seeding handle is opened after that.
    await app.init();
    database = createDatabase(databaseUrl);
  }, CONTAINER_TIMEOUT_MS);

  afterAll(async () => {
    await app?.close();
    await database?.close();
    await postgres?.stop();
  }, CONTAINER_TIMEOUT_MS);

  describe('history list', () => {
    it(
      'should return only the recipient rows, newest first with the tie broken by id',
      async () => {
        const recipient = randomUUID();
        const base = minutesAfter(OCCURRED_AT, 0);
        const mine = [
          await seed({ recipientAccountId: recipient, createdAt: minutesAfter(base, 1) }),
          await seed({ recipientAccountId: recipient, createdAt: minutesAfter(base, 2) }),
          await seed({ recipientAccountId: recipient, createdAt: minutesAfter(base, 2) }),
          await seed({ recipientAccountId: recipient, createdAt: minutesAfter(base, 3) }),
        ];
        await seed({ recipientAccountId: HR_OTHER, createdAt: minutesAfter(base, 4) });

        const response = await request(app.getHttpServer())
          .get(INBOX_PATH)
          .query({ limit: 100 })
          .set('Authorization', `Bearer ${tokenFor(recipient)}`)
          .expect(200);

        const page = notificationPageSchema.parse(response.body);
        expect(page.items.map((item) => item.id)).toEqual(newestFirst(mine));
        expect(page.nextCursor).toBeNull();
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should walk every page once when each cursor is sent back, with no overlap',
      async () => {
        const recipient = randomUUID();
        const base = minutesAfter(OCCURRED_AT, 100);
        const seeded = [
          await seed({ recipientAccountId: recipient, createdAt: base }),
          await seed({ recipientAccountId: recipient, createdAt: base }),
          await seed({ recipientAccountId: recipient, createdAt: minutesAfter(base, 1) }),
          await seed({ recipientAccountId: recipient, createdAt: minutesAfter(base, 2) }),
          await seed({ recipientAccountId: recipient, createdAt: minutesAfter(base, 2) }),
        ];
        const pageSizes: number[] = [];
        const seenIds: string[] = [];
        let cursor: string | undefined;

        for (let guard = 0; guard < 10; guard += 1) {
          const response = await request(app.getHttpServer())
            .get(INBOX_PATH)
            .query(cursor === undefined ? { limit: 2 } : { limit: 2, cursor })
            .set('Authorization', `Bearer ${tokenFor(recipient)}`)
            .expect(200);
          const page = notificationPageSchema.parse(response.body);
          pageSizes.push(page.items.length);
          seenIds.push(...page.items.map((item) => item.id));
          if (page.nextCursor === null) break;
          cursor = page.nextCursor;
        }

        expect(pageSizes).toEqual([2, 2, 1]);
        expect(seenIds).toEqual(newestFirst(seeded));
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should answer an empty page with a null cursor when the inbox has no rows',
      async () => {
        const response = await request(app.getHttpServer())
          .get(INBOX_PATH)
          .set('Authorization', `Bearer ${tokenFor(randomUUID())}`)
          .expect(200);

        expect(response.body).toEqual({ items: [], nextCursor: null });
      },
      TEST_TIMEOUT_MS,
    );

    it.each([
      { condition: 'the cursor is not a cursor', query: { cursor: 'not-a-cursor' } },
      { condition: 'the cursor is empty', query: { cursor: '' } },
      { condition: 'the limit is 0', query: { limit: 0 } },
      { condition: 'the limit is above 100', query: { limit: 101 } },
      { condition: 'a page number is sent', query: { page: 2 } },
      { condition: 'the recipient is named in the query', query: { recipientAccountId: HR_OTHER } },
    ])(
      'should answer 400 when $condition',
      async ({ query }) => {
        const response = await request(app.getHttpServer())
          .get(INBOX_PATH)
          .query(query)
          .set('Authorization', `Bearer ${tokenFor(HR_ME)}`)
          .expect(400);

        expect(response.body).toMatchObject({ statusCode: 400, code: ErrorCode.VALIDATION_FAILED });
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('unread count', () => {
    it(
      'should count only the unread rows of the recipient, and drop by one after a row is marked read',
      async () => {
        const recipient = randomUUID();
        const base = minutesAfter(OCCURRED_AT, 200);
        await seed({ recipientAccountId: recipient, createdAt: base });
        await seed({ recipientAccountId: recipient, createdAt: base });
        await seed({
          recipientAccountId: recipient,
          createdAt: base,
          readAt: minutesAfter(base, 1),
        });
        await seed({ recipientAccountId: HR_OTHER, createdAt: base });
        const toRead = await seed({ recipientAccountId: recipient, createdAt: base });

        const before = await request(app.getHttpServer())
          .get(UNREAD_COUNT_PATH)
          .set('Authorization', `Bearer ${tokenFor(recipient)}`)
          .expect(200);
        await request(app.getHttpServer())
          .post(readPath(toRead.id))
          .set('Authorization', `Bearer ${tokenFor(recipient)}`)
          .expect(200);
        const after = await request(app.getHttpServer())
          .get(UNREAD_COUNT_PATH)
          .set('Authorization', `Bearer ${tokenFor(recipient)}`)
          .expect(200);

        expect(notificationUnreadCountSchema.parse(before.body)).toEqual({ unreadCount: 3 });
        expect(notificationUnreadCountSchema.parse(after.body)).toEqual({ unreadCount: 2 });
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('mark as read', () => {
    it(
      'should return the notification in the contract shape with the read time from the clock',
      async () => {
        const recipient = randomUUID();
        const row = await seed({ recipientAccountId: recipient, createdAt: OCCURRED_AT });
        clock.set(FIRST_READ_AT);

        const response = await request(app.getHttpServer())
          .post(readPath(row.id))
          .set('Authorization', `Bearer ${tokenFor(recipient)}`)
          .expect(200);

        const notification: Notification = notificationSchema.parse(response.body);
        expect(notification).toMatchObject({
          id: row.id,
          readAt: FIRST_READ_AT.toISOString(),
        });
        expect(await readStoredReadAt(row.id)).toEqual(FIRST_READ_AT);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should keep the first read time when the notification is marked read twice',
      async () => {
        const recipient = randomUUID();
        const row = await seed({ recipientAccountId: recipient, createdAt: OCCURRED_AT });
        clock.set(FIRST_READ_AT);
        await request(app.getHttpServer())
          .post(readPath(row.id))
          .set('Authorization', `Bearer ${tokenFor(recipient)}`)
          .expect(200);
        clock.set(LATER_READ_AT);

        const second = await request(app.getHttpServer())
          .post(readPath(row.id))
          .set('Authorization', `Bearer ${tokenFor(recipient)}`)
          .expect(200);

        expect(notificationSchema.parse(second.body).readAt).toBe(FIRST_READ_AT.toISOString());
        expect(await readStoredReadAt(row.id)).toEqual(FIRST_READ_AT);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should answer 404 and leave the row unread when another HR account marks it',
      async () => {
        const row = await seed({ recipientAccountId: HR_OTHER, createdAt: OCCURRED_AT });

        const response = await request(app.getHttpServer())
          .post(readPath(row.id))
          .set('Authorization', `Bearer ${tokenFor(HR_ME)}`)
          .expect(404);

        expect(response.body).toMatchObject({ statusCode: 404, code: ErrorCode.NOT_FOUND });
        expect(await readStoredReadAt(row.id)).toBeNull();
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should answer 404 when no notification has the ID',
      async () => {
        const response = await request(app.getHttpServer())
          .post(readPath(randomUUID()))
          .set('Authorization', `Bearer ${tokenFor(HR_ME)}`)
          .expect(404);

        expect(response.body).toMatchObject({ statusCode: 404, code: ErrorCode.NOT_FOUND });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should answer 400 when the ID is not a UUID',
      async () => {
        const response = await request(app.getHttpServer())
          .post(readPath('not-a-uuid'))
          .set('Authorization', `Bearer ${tokenFor(HR_ME)}`)
          .expect(400);

        expect(response.body).toMatchObject({ statusCode: 400, code: ErrorCode.VALIDATION_FAILED });
        expect(notificationIdParamSchema.safeParse({ id: 'not-a-uuid' }).success).toBe(false);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('access', () => {
    it(
      'should answer 403 for every inbox route when an employee token is sent',
      async () => {
        const employee = tokenFor(EMPLOYEE_ACCOUNT, Role.EMPLOYEE);
        const row = await seed({ recipientAccountId: EMPLOYEE_ACCOUNT, createdAt: OCCURRED_AT });

        await request(app.getHttpServer())
          .get(INBOX_PATH)
          .set('Authorization', `Bearer ${employee}`)
          .expect(403);
        await request(app.getHttpServer())
          .get(UNREAD_COUNT_PATH)
          .set('Authorization', `Bearer ${employee}`)
          .expect(403);
        await request(app.getHttpServer())
          .post(readPath(row.id))
          .set('Authorization', `Bearer ${employee}`)
          .expect(403);
        expect(await readStoredReadAt(row.id)).toBeNull();
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should answer 401 when an end-user JWT is sent, because only the gateway verifies end-user tokens',
      async () => {
        await request(app.getHttpServer())
          .get(INBOX_PATH)
          .set('Authorization', `Bearer ${signEndUserJwt(keys, HR_ME, Role.HR)}`)
          .expect(401);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should answer 401 when no bearer token is sent',
      async () => {
        await request(app.getHttpServer()).get(UNREAD_COUNT_PATH).expect(401);
      },
      TEST_TIMEOUT_MS,
    );
  });
});
