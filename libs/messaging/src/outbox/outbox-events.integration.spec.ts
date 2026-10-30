import { createDatabase, runMigrations, type Database } from '@dexa/db';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { getTableName, sql } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import * as publishingServiceSchema from '../../test/fixtures/outbox-service.schema.js';

// Same image as compose.yaml, so the migration runs against the Postgres version the services use.
const POSTGRES_IMAGE = 'postgres:18';
const CONTAINER_START_TIMEOUT_MS = 120_000;
// SQLSTATE values from the Postgres error codes table.
const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';
const OUTBOX_MIGRATIONS_FOLDER = fileURLToPath(
  new URL('../../test/fixtures/outbox-migrations', import.meta.url),
);

describe('outbox_events migration', () => {
  let postgres: StartedPostgreSqlContainer;
  let database: Database;

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
    database = createDatabase(postgres.getConnectionUri());
    await runMigrations(database, OUTBOX_MIGRATIONS_FOLDER);
  }, CONTAINER_START_TIMEOUT_MS);

  afterAll(async () => {
    await database.close();
    await postgres.stop();
  });

  it('should export the outbox table from the package entry when a service re-exports it', () => {
    expect(getTableName(publishingServiceSchema.outboxEvents)).toBe('outbox_events');
  });

  it('should create the primary key, both checks, and the partial relay index when the migration runs', async () => {
    // Postgres 18 also records NOT NULL as a constraint (contype 'n'). Only the primary key ('p') and the
    // checks ('c') are named here.
    const constraints = await database.db.execute<{ conname: string }>(sql`
      select conname from pg_constraint
      where conrelid = 'outbox_events'::regclass and contype in ('p', 'c')
    `);
    const indexes = await database.db.execute<{ indexdef: string }>(sql`
      select indexdef from pg_indexes
      where tablename = 'outbox_events' and indexname = 'outbox_events_next_attempt_at_created_at_idx'
    `);

    expect(constraints.rows.map((row) => row.conname).sort()).toEqual([
      'outbox_events_attempt_count_ck',
      'outbox_events_id_pk',
      'outbox_events_payload_ck',
    ]);
    expect(indexes.rows).toEqual([
      expect.objectContaining({ indexdef: expect.stringMatching(/WHERE .*published_at IS NULL/i) }),
    ]);
  });

  it('should reject a payload that is not a JSON object when a row is inserted directly', async () => {
    await expect(
      database.db.execute(sql`
        insert into outbox_events (id, event_type, payload, occurred_at)
        values (gen_random_uuid(), 'employee.profile.updated', '[]'::jsonb, now())
      `),
    ).rejects.toMatchObject({ cause: { code: CHECK_VIOLATION } });
  });

  it('should reject a negative attempt count when a row is inserted directly', async () => {
    await expect(
      database.db.execute(sql`
        insert into outbox_events (id, event_type, payload, occurred_at, attempt_count)
        values (gen_random_uuid(), 'employee.profile.updated', '{}'::jsonb, now(), -1)
      `),
    ).rejects.toMatchObject({ cause: { code: CHECK_VIOLATION } });
  });

  it('should reject a second row with the same event ID when a row is inserted directly', async () => {
    const eventId = '0c9e6b1a-5d4f-4f7a-8b2e-3a1c9d8e7f60';
    await database.db.execute(sql`
      insert into outbox_events (id, event_type, payload, occurred_at)
      values (${eventId}, 'employee.profile.updated', '{}'::jsonb, now())
    `);

    await expect(
      database.db.execute(sql`
        insert into outbox_events (id, event_type, payload, occurred_at)
        values (${eventId}, 'employee.profile.updated', '{}'::jsonb, now())
      `),
    ).rejects.toMatchObject({ cause: { code: UNIQUE_VIOLATION } });
  });
});
