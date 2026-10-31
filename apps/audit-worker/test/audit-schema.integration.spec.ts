import { createDatabase, runMigrations, type Database } from '@dexa/db';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { auditLogs, dlqMessages } from '../src/infrastructure/db/schema.js';
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
const PROCESSED_AT = new Date('2026-10-30T02:05:01Z');
const FIRST_FAILED_AT = new Date('2026-10-30T02:05:00Z');
const LAST_FAILED_AT = new Date('2026-10-30T02:06:00Z');

type AuditLogInsert = typeof auditLogs.$inferInsert;
type DlqMessageInsert = typeof dlqMessages.$inferInsert;

let container: StartedPostgreSqlContainer;
let openDatabases: Database[] = [];

async function openMigratedDatabase(): Promise<Database> {
  const databaseUrl = await createEmptyDatabaseUri(container.getConnectionUri());
  const database = createDatabase(databaseUrl);
  openDatabases.push(database);
  await runMigrations(database, MIGRATIONS_FOLDER);
  return database;
}

function auditLogValues(overrides: Partial<AuditLogInsert> = {}): AuditLogInsert {
  return {
    eventId: randomUUID(),
    eventType: 'employee.profile.updated',
    sourceService: 'employee-service',
    accountId: randomUUID(),
    actorAccountId: randomUUID(),
    changedFields: ['phone'],
    occurredAt: OCCURRED_AT,
    processedAt: PROCESSED_AT,
    ...overrides,
  };
}

function dlqMessageValues(overrides: Partial<DlqMessageInsert> = {}): DlqMessageInsert {
  return {
    messageId: randomUUID(),
    sourceQueue: 'audit.profile-changes',
    payload: Buffer.from('{"eventId":"not-a-uuid"}'),
    attemptCount: 3,
    lastError: 'AUDIT_PERSISTENCE_FAILED',
    firstFailedAt: FIRST_FAILED_AT,
    lastFailedAt: LAST_FAILED_AT,
    ...overrides,
  };
}

async function insertAuditLog(database: Database, overrides: Partial<AuditLogInsert> = {}) {
  await database.db.insert(auditLogs).values(auditLogValues(overrides));
}

async function insertDlqMessage(database: Database, overrides: Partial<DlqMessageInsert> = {}) {
  await database.db.insert(dlqMessages).values(dlqMessageValues(overrides));
}

// Drizzle types status as a union, so an out-of-range status needs a raw statement to reach the database.
async function insertDlqMessageWithRawStatus(database: Database, status: string) {
  await database.db.execute(sql`
    insert into dlq_messages
      (message_id, source_queue, payload, attempt_count, last_error, status, first_failed_at, last_failed_at)
    values
      (${randomUUID()}, 'audit.profile-changes', ${Buffer.from('{}')}, 1, 'AUDIT_PERSISTENCE_FAILED',
       ${status}, ${FIRST_FAILED_AT}, ${LAST_FAILED_AT})
  `);
}

// A JSON object is valid jsonb but not a changed-field list, which the typed insert cannot express.
async function insertAuditLogWithJsonObjectChangedFields(database: Database) {
  await database.db.execute(sql`
    insert into audit_logs
      (event_id, event_type, source_service, account_id, actor_account_id, changed_fields, occurred_at, processed_at)
    values
      (${randomUUID()}, 'employee.profile.updated', 'employee-service', ${randomUUID()}, ${randomUUID()},
       '{"phone": true}'::jsonb, ${OCCURRED_AT}, ${PROCESSED_AT})
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

describe('audit schema constraints', () => {
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

  describe('audit_logs', () => {
    it(
      'should reject a second row with the same event_id',
      async () => {
        const database = await openMigratedDatabase();
        const eventId = randomUUID();
        await insertAuditLog(database, { eventId });

        const failure = await failureOf(
          database.db
            .insert(auditLogs)
            .values(auditLogValues({ eventId, eventType: 'account.password.changed' })),
        );

        expect(failure).toEqual({
          sqlState: UNIQUE_VIOLATION,
          constraint: 'audit_logs_event_id_pk',
        });
        const stored = await database.db
          .select({ eventType: auditLogs.eventType })
          .from(auditLogs)
          .where(eq(auditLogs.eventId, eventId));
        expect(stored.map((row) => row.eventType)).toEqual(['employee.profile.updated']);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should accept a row with neither resource field set',
      async () => {
        const database = await openMigratedDatabase();

        await insertAuditLog(database, { resourceType: null, resourceId: null });

        const stored = await database.db.select({ eventId: auditLogs.eventId }).from(auditLogs);
        expect(stored).toHaveLength(1);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should accept a row with both resource fields set',
      async () => {
        const database = await openMigratedDatabase();

        await insertAuditLog(database, {
          eventType: 'attendance.request.approved',
          sourceService: 'attendance-service',
          resourceType: 'attendance_adjustment_request',
          resourceId: randomUUID(),
          changedFields: [],
        });

        const stored = await database.db.select({ eventId: auditLogs.eventId }).from(auditLogs);
        expect(stored).toHaveLength(1);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reject a resource type without a resource id',
      async () => {
        const database = await openMigratedDatabase();

        const failure = await failureOf(
          database.db
            .insert(auditLogs)
            .values(auditLogValues({ resourceType: 'overtime_request', resourceId: null })),
        );

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'audit_logs_resource_type_resource_id_ck',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reject a resource id without a resource type',
      async () => {
        const database = await openMigratedDatabase();

        const failure = await failureOf(
          database.db
            .insert(auditLogs)
            .values(auditLogValues({ resourceType: null, resourceId: randomUUID() })),
        );

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'audit_logs_resource_type_resource_id_ck',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should accept an empty changed_fields array for an attendance workflow fact',
      async () => {
        const database = await openMigratedDatabase();

        await insertAuditLog(database, {
          eventType: 'attendance.request.rejected',
          sourceService: 'attendance-service',
          resourceType: 'overtime_request',
          resourceId: randomUUID(),
          changedFields: [],
        });

        const [stored] = await database.db
          .select({ changedFields: auditLogs.changedFields })
          .from(auditLogs);
        expect(stored?.changedFields).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reject changed_fields that is a JSON object',
      async () => {
        const database = await openMigratedDatabase();

        const failure = await failureOf(insertAuditLogWithJsonObjectChangedFields(database));

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'audit_logs_changed_fields_ck',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should create only the documented keys and checks',
      async () => {
        const database = await openMigratedDatabase();

        expect(await constraintNamesOf(database, 'audit_logs')).toEqual([
          'audit_logs_changed_fields_ck',
          'audit_logs_event_id_pk',
          'audit_logs_resource_type_resource_id_ck',
        ]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should index account_id with occurred_at and resource identity with occurred_at',
      async () => {
        const database = await openMigratedDatabase();

        const indexes = await indexDefinitionsOf(database, 'audit_logs');

        expect(indexes).toEqual({
          audit_logs_account_id_occurred_at_idx: expect.stringContaining(
            '(account_id, occurred_at)',
          ),
          audit_logs_event_id_pk: expect.stringContaining('(event_id)'),
          audit_logs_resource_type_resource_id_occurred_at_idx: expect.stringContaining(
            '(resource_type, resource_id, occurred_at)',
          ),
        });
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('dlq_messages', () => {
    it(
      'should reject a second record for the same source queue and message id',
      async () => {
        const database = await openMigratedDatabase();
        const messageId = randomUUID();
        await insertDlqMessage(database, { messageId });

        const failure = await failureOf(
          database.db.insert(dlqMessages).values(dlqMessageValues({ messageId })),
        );

        expect(failure).toEqual({
          sqlState: UNIQUE_VIOLATION,
          constraint: 'dlq_messages_source_queue_message_id_uq',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should accept the same message id from a different source queue',
      async () => {
        const database = await openMigratedDatabase();
        const messageId = randomUUID();
        await insertDlqMessage(database, { messageId, sourceQueue: 'audit.profile-changes' });

        await insertDlqMessage(database, { messageId, sourceQueue: 'audit.password-changes' });

        const stored = await database.db.select({ id: dlqMessages.id }).from(dlqMessages);
        expect(stored).toHaveLength(2);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reject an attempt count below one',
      async () => {
        const database = await openMigratedDatabase();

        const failure = await failureOf(
          database.db.insert(dlqMessages).values(dlqMessageValues({ attemptCount: 0 })),
        );

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'dlq_messages_attempt_count_ck',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reject a last failure earlier than the first failure',
      async () => {
        const database = await openMigratedDatabase();

        const failure = await failureOf(
          database.db.insert(dlqMessages).values(
            dlqMessageValues({
              firstFailedAt: LAST_FAILED_AT,
              lastFailedAt: FIRST_FAILED_AT,
            }),
          ),
        );

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'dlq_messages_last_failed_at_first_failed_at_ck',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should accept a last failure at the same instant as the first failure',
      async () => {
        const database = await openMigratedDatabase();

        await insertDlqMessage(database, {
          firstFailedAt: FIRST_FAILED_AT,
          lastFailedAt: FIRST_FAILED_AT,
        });

        const stored = await database.db.select({ id: dlqMessages.id }).from(dlqMessages);
        expect(stored).toHaveLength(1);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reject a status outside PENDING, REQUEUED, and RESOLVED',
      async () => {
        const database = await openMigratedDatabase();

        const failure = await failureOf(insertDlqMessageWithRawStatus(database, 'ARCHIVED'));

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'dlq_messages_status_ck',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reject a RESOLVED record without resolved_at',
      async () => {
        const database = await openMigratedDatabase();

        const failure = await failureOf(
          database.db
            .insert(dlqMessages)
            .values(dlqMessageValues({ status: 'RESOLVED', resolvedAt: null })),
        );

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'dlq_messages_resolved_at_status_ck',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it.each(['PENDING', 'REQUEUED'] as const)(
      'should reject a %s record that carries resolved_at',
      async (status) => {
        const database = await openMigratedDatabase();

        const failure = await failureOf(
          database.db
            .insert(dlqMessages)
            .values(dlqMessageValues({ status, resolvedAt: LAST_FAILED_AT })),
        );

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'dlq_messages_resolved_at_status_ck',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should accept a RESOLVED record with resolved_at',
      async () => {
        const database = await openMigratedDatabase();

        await insertDlqMessage(database, { status: 'RESOLVED', resolvedAt: LAST_FAILED_AT });

        const [stored] = await database.db
          .select({ status: dlqMessages.status, resolvedAt: dlqMessages.resolvedAt })
          .from(dlqMessages);
        expect(stored).toEqual({ status: 'RESOLVED', resolvedAt: LAST_FAILED_AT });
      },
      TEST_TIMEOUT_MS,
    );

    it.each(['PENDING', 'REQUEUED'] as const)(
      'should accept a %s record without resolved_at',
      async (status) => {
        const database = await openMigratedDatabase();

        await insertDlqMessage(database, {
          status,
          requeuedAt: status === 'REQUEUED' ? LAST_FAILED_AT : null,
        });

        const stored = await database.db.select({ status: dlqMessages.status }).from(dlqMessages);
        expect(stored).toEqual([{ status }]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should default status to PENDING and headers to an empty object',
      async () => {
        const database = await openMigratedDatabase();

        await insertDlqMessage(database);

        const [stored] = await database.db
          .select({ status: dlqMessages.status, headers: dlqMessages.headers })
          .from(dlqMessages);
        expect(stored).toEqual({ status: 'PENDING', headers: {} });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should store a message body that is not JSON byte for byte',
      async () => {
        const database = await openMigratedDatabase();
        const rawBody = Buffer.from([0xff, 0xfe, 0x00, 0x7b, 0x22]);

        await insertDlqMessage(database, { payload: rawBody, eventId: null });

        const [stored] = await database.db
          .select({ payload: dlqMessages.payload, eventId: dlqMessages.eventId })
          .from(dlqMessages);
        expect(stored?.payload.equals(rawBody)).toBe(true);
        expect(stored?.eventId).toBeNull();
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should create only the documented keys and checks',
      async () => {
        const database = await openMigratedDatabase();

        expect(await constraintNamesOf(database, 'dlq_messages')).toEqual([
          'dlq_messages_attempt_count_ck',
          'dlq_messages_id_pk',
          'dlq_messages_last_failed_at_first_failed_at_ck',
          'dlq_messages_resolved_at_status_ck',
          'dlq_messages_source_queue_message_id_uq',
          'dlq_messages_status_ck',
        ]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should index status with last_failed_at and event_id',
      async () => {
        const database = await openMigratedDatabase();

        const indexes = await indexDefinitionsOf(database, 'dlq_messages');

        expect(indexes).toEqual(
          expect.objectContaining({
            dlq_messages_status_last_failed_at_idx: expect.stringContaining(
              '(status, last_failed_at)',
            ),
            dlq_messages_event_id_idx: expect.stringContaining('(event_id)'),
          }),
        );
      },
      TEST_TIMEOUT_MS,
    );
  });
});
