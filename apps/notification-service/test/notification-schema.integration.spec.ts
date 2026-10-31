import { createDatabase, runMigrations, type Database } from '@dexa/db';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { notifications } from '../src/infrastructure/db/schema.js';
import {
  CONTAINER_TIMEOUT_MS,
  MIGRATIONS_FOLDER,
  TEST_TIMEOUT_MS,
  createEmptyDatabaseUri,
  failureOf,
} from './test-database.js';

const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';

const OCCURRED_AT = new Date('2026-10-30T02:05:00Z');
const CREATED_AT = new Date('2026-10-30T02:05:01Z');
const READ_AT = new Date('2026-10-30T03:00:00Z');

type NotificationInsert = typeof notifications.$inferInsert;

let container: StartedPostgreSqlContainer;
let openDatabases: Database[] = [];

async function openMigratedDatabase(): Promise<Database> {
  const databaseUrl = await createEmptyDatabaseUri(container.getConnectionUri());
  const database = createDatabase(databaseUrl);
  openDatabases.push(database);
  await runMigrations(database, MIGRATIONS_FOLDER);
  return database;
}

function notificationValues(overrides: Partial<NotificationInsert> = {}): NotificationInsert {
  return {
    eventId: randomUUID(),
    eventType: 'employee.profile.updated',
    recipientAccountId: randomUUID(),
    subjectAccountId: randomUUID(),
    actorAccountId: randomUUID(),
    title: 'Budi updated: phone',
    body: 'Budi changed the phone number.',
    occurredAt: OCCURRED_AT,
    createdAt: CREATED_AT,
    ...overrides,
  };
}

async function insertNotification(database: Database, overrides: Partial<NotificationInsert> = {}) {
  await database.db.insert(notifications).values(notificationValues(overrides));
}

// A JSON array is valid jsonb but not an object, which the typed insert cannot express.
async function insertNotificationWithJsonArrayData(database: Database) {
  await database.db.execute(sql`
    insert into notifications
      (event_id, event_type, recipient_account_id, subject_account_id, actor_account_id, title, body,
       data, occurred_at, created_at)
    values
      (${randomUUID()}, 'employee.profile.updated', ${randomUUID()}, ${randomUUID()}, ${randomUUID()},
       'Budi updated: phone', 'Budi changed the phone number.', '[]'::jsonb, ${OCCURRED_AT}, ${CREATED_AT})
  `);
}

async function indexDefinitionsOf(
  database: Database,
  tableName: string,
): Promise<Record<string, string>> {
  const result = await database.db.execute<{ indexname: string; indexdef: string }>(sql`
    select indexname, indexdef from pg_indexes where tablename = ${tableName}
  `);
  return Object.fromEntries(result.rows.map((row) => [row.indexname, row.indexdef]));
}

async function constraintNamesOf(database: Database, tableName: string): Promise<string[]> {
  // Postgres 18 also records NOT NULL as a constraint (contype 'n'), so only keys ('p', 'u') and checks ('c') are listed.
  const result = await database.db.execute<{ conname: string }>(sql`
    select conname from pg_constraint
    where conrelid = ${tableName}::regclass and contype in ('p', 'u', 'c')
  `);
  return result.rows.map((row) => row.conname).sort();
}

describe('notification schema constraints', () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18').start();
  }, CONTAINER_TIMEOUT_MS);

  // Teardown still stops the container when setup failed partway through.
  afterAll(async () => {
    await container?.stop();
  }, CONTAINER_TIMEOUT_MS);

  afterEach(async () => {
    await Promise.all(openDatabases.map((database) => database.close()));
    openDatabases = [];
  });

  describe('notifications', () => {
    it(
      'should reject a second row for the same event and recipient',
      async () => {
        const database = await openMigratedDatabase();
        const eventId = randomUUID();
        const recipientAccountId = randomUUID();
        await insertNotification(database, { eventId, recipientAccountId });

        const failure = await failureOf(
          database.db
            .insert(notifications)
            .values(notificationValues({ eventId, recipientAccountId, title: 'Redelivered' })),
        );

        expect(failure).toEqual({
          sqlState: UNIQUE_VIOLATION,
          constraint: 'notifications_event_id_recipient_account_id_uq',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should accept the same event for a different recipient',
      async () => {
        const database = await openMigratedDatabase();
        const eventId = randomUUID();
        await insertNotification(database, { eventId, recipientAccountId: randomUUID() });

        await insertNotification(database, { eventId, recipientAccountId: randomUUID() });

        const stored = await database.db.select({ id: notifications.id }).from(notifications);
        expect(stored).toHaveLength(2);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should default data to an empty object and leave read_at unset',
      async () => {
        const database = await openMigratedDatabase();

        await insertNotification(database);

        const [stored] = await database.db
          .select({ data: notifications.data, readAt: notifications.readAt })
          .from(notifications);
        expect(stored).toEqual({ data: {}, readAt: null });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reject a read_at earlier than created_at',
      async () => {
        const database = await openMigratedDatabase();

        const failure = await failureOf(
          database.db
            .insert(notifications)
            .values(notificationValues({ readAt: new Date(CREATED_AT.getTime() - 1000) })),
        );

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'notifications_read_at_created_at_ck',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should accept a read_at after created_at',
      async () => {
        const database = await openMigratedDatabase();

        await insertNotification(database, { readAt: READ_AT });

        const [stored] = await database.db
          .select({ readAt: notifications.readAt })
          .from(notifications);
        expect(stored?.readAt?.getTime()).toBe(READ_AT.getTime());
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should accept a read_at equal to created_at',
      async () => {
        const database = await openMigratedDatabase();

        await insertNotification(database, { readAt: CREATED_AT });

        const stored = await database.db.select({ id: notifications.id }).from(notifications);
        expect(stored).toHaveLength(1);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reject data that is a JSON array',
      async () => {
        const database = await openMigratedDatabase();

        const failure = await failureOf(insertNotificationWithJsonArrayData(database));

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'notifications_data_ck',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should create only the documented keys and checks',
      async () => {
        const database = await openMigratedDatabase();

        expect(await constraintNamesOf(database, 'notifications')).toEqual([
          'notifications_data_ck',
          'notifications_event_id_recipient_account_id_uq',
          'notifications_id_pk',
          'notifications_read_at_created_at_ck',
        ]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should index history by recipient and an unread-only partial index with the same order',
      async () => {
        const database = await openMigratedDatabase();

        const indexes = await indexDefinitionsOf(database, 'notifications');

        expect(indexes).toEqual({
          notifications_id_pk: expect.stringContaining('(id)'),
          notifications_event_id_recipient_account_id_uq: expect.stringContaining(
            '(event_id, recipient_account_id)',
          ),
          notifications_recipient_account_id_created_at_id_idx: expect.stringContaining(
            '(recipient_account_id, created_at DESC, id DESC)',
          ),
          notifications_recipient_account_id_created_at_id_unread_idx: expect.stringContaining(
            '(recipient_account_id, created_at DESC, id DESC) WHERE (read_at IS NULL)',
          ),
        });
      },
      TEST_TIMEOUT_MS,
    );
  });
});
