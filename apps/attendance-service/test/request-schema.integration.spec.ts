import { createDatabase, runMigrations, type Database } from '@dexa/db';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq, sql } from 'drizzle-orm';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  attendanceAdjustmentRequests,
  attendanceDays,
  masterAttendanceStatuses,
  overtimeRequests,
  workSchedules,
} from '../src/infrastructure/db/schema.js';
import {
  CONTAINER_TIMEOUT_MS,
  MIGRATIONS_FOLDER,
  TEST_TIMEOUT_MS,
  createEmptyDatabaseUri,
  failureOf,
  requireRow,
} from './test-database.js';

const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';
const EXCLUSION_VIOLATION = '23P01';

const DAY_DATE = '2026-10-30';
const SCHEDULED_START = new Date('2026-10-30T02:00:00Z'); // 09:00 Asia/Jakarta
const SCHEDULED_END = new Date('2026-10-30T11:00:00Z'); // 18:00 Asia/Jakarta
const CREATED_AT = new Date('2026-10-30T03:00:00Z');
const REVIEWED_AT = new Date('2026-10-30T04:00:00Z');
const OVERTIME_START = new Date('2026-10-30T11:00:00Z'); // 18:00 Asia/Jakarta
const OVERTIME_END = new Date('2026-10-30T13:00:00Z'); // 20:00 Asia/Jakarta

const HR_REVIEWER_ACCOUNT_ID = randomUUID();

type OvertimeInsert = typeof overtimeRequests.$inferInsert;
type CorrectionInsert = typeof attendanceAdjustmentRequests.$inferInsert;
type DayOwnership = { readonly attendanceDayId: string; readonly requestedByAccountId: string };

const APPROVED_REVIEW = {
  status: 'APPROVED',
  reviewedByAccountId: HR_REVIEWER_ACCOUNT_ID,
  reviewedAt: REVIEWED_AT,
} as const;
const REJECTED_REVIEW = {
  status: 'REJECTED',
  reviewedByAccountId: HR_REVIEWER_ACCOUNT_ID,
  reviewedAt: REVIEWED_AT,
  reviewReason: 'Outside the approved window',
} as const;

let container: StartedPostgreSqlContainer;
let openDatabases: Database[] = [];

// Each test gets an empty database with the reviewed migrations applied, so no test sees another test's rows.
async function startDatabase(): Promise<Database> {
  const databaseUrl = await createEmptyDatabaseUri(container.getConnectionUri());
  const database = createDatabase(databaseUrl);
  openDatabases.push(database);
  await runMigrations(database, MIGRATIONS_FOLDER);
  await database.db.insert(workSchedules).values({
    name: 'Test schedule',
    timezone: 'Asia/Jakarta',
    workingWeekdays: [1, 2, 3, 4, 5],
    startTime: '09:00',
    endTime: '18:00',
    lateCheckinGraceMinutes: 15,
    earlyCheckoutGraceMinutes: 0,
    lateCheckoutGraceMinutes: 0,
    effectiveFrom: '2000-01-01',
  });
  return database;
}

async function statusIdOf(database: Database, code: string): Promise<string> {
  const rows = await database.db
    .select({ id: masterAttendanceStatuses.id })
    .from(masterAttendanceStatuses)
    .where(eq(masterAttendanceStatuses.code, code));
  return requireRow(rows[0]).id;
}

async function scheduleIdOf(database: Database): Promise<string> {
  const rows = await database.db.select({ id: workSchedules.id }).from(workSchedules).limit(1);
  return requireRow(rows[0]).id;
}

// A working day for the account, created the way the first punch or request would create it.
async function insertWorkingDay(
  database: Database,
  accountId: string,
  businessDate: string = DAY_DATE,
): Promise<string> {
  const [row] = await database.db
    .insert(attendanceDays)
    .values({
      accountId,
      businessDate,
      workScheduleId: await scheduleIdOf(database),
      businessTimezone: 'Asia/Jakarta',
      isWorkingDay: true,
      scheduledStartAt: SCHEDULED_START,
      scheduledEndAt: SCHEDULED_END,
      dayStatusId: await statusIdOf(database, 'PENDING'),
      checkinStatusId: await statusIdOf(database, 'PENDING_CHECKIN'),
      checkoutStatusId: await statusIdOf(database, 'PENDING_CHECKOUT'),
    })
    .returning({ id: attendanceDays.id });
  return requireRow(row).id;
}

// A pending overtime request on the day, unless the overrides say otherwise.
async function insertOvertime(
  database: Database,
  ownership: DayOwnership,
  overrides: Partial<OvertimeInsert> = {},
): Promise<string> {
  const [row] = await database.db
    .insert(overtimeRequests)
    .values({
      ...ownership,
      reason: 'Release deployment',
      idempotencyKey: randomUUID(),
      requestedStartAt: OVERTIME_START,
      requestedEndAt: OVERTIME_END,
      createdAt: CREATED_AT,
      ...overrides,
    })
    .returning({ id: overtimeRequests.id });
  return requireRow(row).id;
}

// A pending correction to PRESENT with a clock-in and clock-out, unless the overrides say otherwise.
async function insertCorrection(
  database: Database,
  ownership: DayOwnership,
  overrides: Partial<CorrectionInsert> = {},
): Promise<string> {
  const [row] = await database.db
    .insert(attendanceAdjustmentRequests)
    .values({
      ...ownership,
      reason: 'Forgot to clock in',
      idempotencyKey: randomUUID(),
      baseRevision: 1,
      beforeDayStatusId: await statusIdOf(database, 'PENDING'),
      requestedCheckinAt: SCHEDULED_START,
      requestedCheckoutAt: SCHEDULED_END,
      requestedDayStatusId: await statusIdOf(database, 'PRESENT'),
      createdAt: CREATED_AT,
      ...overrides,
    })
    .returning({ id: attendanceAdjustmentRequests.id });
  return requireRow(row).id;
}

describe('request schema constraints', () => {
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

  describe('overtime overlap', () => {
    it(
      'should reject a pending overtime request that overlaps a pending one of the same employee with exclusion violation 23P01',
      async () => {
        const database = await startDatabase();
        const accountId = randomUUID();
        const ownership = {
          attendanceDayId: await insertWorkingDay(database, accountId),
          requestedByAccountId: accountId,
        };
        await insertOvertime(database, ownership);

        const failure = await failureOf(
          insertOvertime(database, ownership, {
            requestedStartAt: new Date('2026-10-30T12:00:00Z'),
            requestedEndAt: new Date('2026-10-30T14:00:00Z'),
          }),
        );

        expect(failure).toEqual({
          sqlState: EXCLUSION_VIOLATION,
          constraint: 'overtime_no_overlap',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reject a pending overtime request that overlaps an approved one of the same employee with exclusion violation 23P01',
      async () => {
        const database = await startDatabase();
        const accountId = randomUUID();
        const ownership = {
          attendanceDayId: await insertWorkingDay(database, accountId),
          requestedByAccountId: accountId,
        };
        await insertOvertime(database, ownership, APPROVED_REVIEW);

        const failure = await failureOf(
          insertOvertime(database, ownership, {
            requestedStartAt: new Date('2026-10-30T10:30:00Z'),
            requestedEndAt: new Date('2026-10-30T11:30:00Z'),
          }),
        );

        expect(failure).toEqual({
          sqlState: EXCLUSION_VIOLATION,
          constraint: 'overtime_no_overlap',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should accept an overtime request that overlaps a rejected one when the earlier request was rejected',
      async () => {
        const database = await startDatabase();
        const accountId = randomUUID();
        const ownership = {
          attendanceDayId: await insertWorkingDay(database, accountId),
          requestedByAccountId: accountId,
        };
        await insertOvertime(database, ownership, REJECTED_REVIEW);

        await insertOvertime(database, ownership);

        const rows = await database.db
          .select({ id: overtimeRequests.id })
          .from(overtimeRequests)
          .where(eq(overtimeRequests.requestedByAccountId, accountId));
        expect(rows).toHaveLength(2);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should accept back-to-back overtime intervals when one ends where the next starts',
      async () => {
        const database = await startDatabase();
        const accountId = randomUUID();
        const ownership = {
          attendanceDayId: await insertWorkingDay(database, accountId),
          requestedByAccountId: accountId,
        };
        await insertOvertime(database, ownership);

        await insertOvertime(database, ownership, {
          requestedStartAt: OVERTIME_END,
          requestedEndAt: new Date('2026-10-30T14:00:00Z'),
        });

        const rows = await database.db
          .select({ id: overtimeRequests.id })
          .from(overtimeRequests)
          .where(eq(overtimeRequests.requestedByAccountId, accountId));
        expect(rows).toHaveLength(2);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should accept the same overtime interval for two different employees',
      async () => {
        const database = await startDatabase();
        const firstAccountId = randomUUID();
        const secondAccountId = randomUUID();

        await insertOvertime(database, {
          attendanceDayId: await insertWorkingDay(database, firstAccountId),
          requestedByAccountId: firstAccountId,
        });
        await insertOvertime(database, {
          attendanceDayId: await insertWorkingDay(database, secondAccountId),
          requestedByAccountId: secondAccountId,
        });

        const rows = await database.db.select({ id: overtimeRequests.id }).from(overtimeRequests);
        expect(rows).toHaveLength(2);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('overtime checks', () => {
    it.each([
      { label: 'equal to the start', requestedEndAt: OVERTIME_START },
      { label: 'before the start', requestedEndAt: new Date('2026-10-30T10:00:00Z') },
    ])(
      'should reject an overtime end $label with check violation 23514',
      async ({ requestedEndAt }) => {
        const database = await startDatabase();
        const accountId = randomUUID();
        const ownership = {
          attendanceDayId: await insertWorkingDay(database, accountId),
          requestedByAccountId: accountId,
        };

        const failure = await failureOf(insertOvertime(database, ownership, { requestedEndAt }));

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'overtime_requests_requested_order_ck',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it.each([
      { label: 'null', reviewReason: null },
      { label: 'blank', reviewReason: '   ' },
    ])(
      'should reject a rejection with a $label reason with check violation 23514',
      async ({ reviewReason }) => {
        const database = await startDatabase();
        const accountId = randomUUID();
        const ownership = {
          attendanceDayId: await insertWorkingDay(database, accountId),
          requestedByAccountId: accountId,
        };

        const failure = await failureOf(
          insertOvertime(database, ownership, { ...REJECTED_REVIEW, reviewReason }),
        );

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'overtime_requests_rejection_reason_ck',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should accept an approval without a review reason',
      async () => {
        const database = await startDatabase();
        const accountId = randomUUID();
        const ownership = {
          attendanceDayId: await insertWorkingDay(database, accountId),
          requestedByAccountId: accountId,
        };

        const requestId = await insertOvertime(database, ownership, APPROVED_REVIEW);

        const [row] = await database.db
          .select({ reviewReason: overtimeRequests.reviewReason })
          .from(overtimeRequests)
          .where(eq(overtimeRequests.id, requestId));
        expect(row?.reviewReason).toBeNull();
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reject a blank request reason with check violation 23514',
      async () => {
        const database = await startDatabase();
        const accountId = randomUUID();
        const ownership = {
          attendanceDayId: await insertWorkingDay(database, accountId),
          requestedByAccountId: accountId,
        };

        const failure = await failureOf(insertOvertime(database, ownership, { reason: '   ' }));

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'overtime_requests_reason_ck',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reject a review by the requester with check violation 23514',
      async () => {
        const database = await startDatabase();
        const accountId = randomUUID();
        const ownership = {
          attendanceDayId: await insertWorkingDay(database, accountId),
          requestedByAccountId: accountId,
        };

        const failure = await failureOf(
          insertOvertime(database, ownership, {
            ...APPROVED_REVIEW,
            reviewedByAccountId: accountId,
          }),
        );

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'overtime_requests_self_review_ck',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reject a review time before the request was created with check violation 23514',
      async () => {
        const database = await startDatabase();
        const accountId = randomUUID();
        const ownership = {
          attendanceDayId: await insertWorkingDay(database, accountId),
          requestedByAccountId: accountId,
        };

        const failure = await failureOf(
          insertOvertime(database, ownership, {
            ...APPROVED_REVIEW,
            reviewedAt: new Date('2026-10-30T02:00:00Z'),
          }),
        );

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'overtime_requests_reviewed_at_ck',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it.each([
      {
        label: 'a pending request with a reviewer',
        overrides: { reviewedByAccountId: HR_REVIEWER_ACCOUNT_ID, reviewedAt: REVIEWED_AT },
      },
      { label: 'an approved request without a reviewer', overrides: { status: 'APPROVED' } },
    ])(
      'should reject $label with check violation 23514',
      async ({ overrides }) => {
        const database = await startDatabase();
        const accountId = randomUUID();
        const ownership = {
          attendanceDayId: await insertWorkingDay(database, accountId),
          requestedByAccountId: accountId,
        };

        const failure = await failureOf(insertOvertime(database, ownership, overrides));

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'overtime_requests_review_identity_ck',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reject an unknown request status with check violation 23514',
      async () => {
        const database = await startDatabase();
        const accountId = randomUUID();
        const ownership = {
          attendanceDayId: await insertWorkingDay(database, accountId),
          requestedByAccountId: accountId,
        };

        // A decided shape keeps the review-identity check satisfied, so only the status check can fail.
        const failure = await failureOf(
          insertOvertime(database, ownership, { ...APPROVED_REVIEW, status: 'CANCELLED' }),
        );

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'overtime_requests_status_ck',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reject a second overtime request with the same idempotency key for the same employee with unique violation 23505',
      async () => {
        const database = await startDatabase();
        const accountId = randomUUID();
        const ownership = {
          attendanceDayId: await insertWorkingDay(database, accountId),
          requestedByAccountId: accountId,
        };
        const idempotencyKey = randomUUID();
        await insertOvertime(database, ownership, { idempotencyKey });

        const failure = await failureOf(
          insertOvertime(database, ownership, {
            idempotencyKey,
            requestedStartAt: new Date('2026-10-30T14:00:00Z'),
            requestedEndAt: new Date('2026-10-30T15:00:00Z'),
          }),
        );

        expect(failure).toEqual({
          sqlState: UNIQUE_VIOLATION,
          constraint: 'overtime_requests_requester_idempotency_uq',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reject an overtime request for a day owned by another account with foreign key violation 23503',
      async () => {
        const database = await startDatabase();
        const ownerAccountId = randomUUID();
        const otherAccountId = randomUUID();
        const attendanceDayId = await insertWorkingDay(database, ownerAccountId);

        const failure = await failureOf(
          insertOvertime(database, { attendanceDayId, requestedByAccountId: otherAccountId }),
        );

        expect(failure).toEqual({
          sqlState: FOREIGN_KEY_VIOLATION,
          constraint: 'overtime_requests_attendance_day_fk',
        });
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('overtime immutability', () => {
    it.each([
      { column: 'reason', change: { reason: 'Different reason' } },
      { column: 'requestedEndAt', change: { requestedEndAt: new Date('2026-10-30T14:00:00Z') } },
      { column: 'idempotencyKey', change: { idempotencyKey: randomUUID() } },
    ])(
      'should reject an UPDATE of $column on a pending overtime request with check violation 23514',
      async ({ change }) => {
        const database = await startDatabase();
        const accountId = randomUUID();
        const requestId = await insertOvertime(database, {
          attendanceDayId: await insertWorkingDay(database, accountId),
          requestedByAccountId: accountId,
        });

        const failure = await failureOf(
          database.db
            .update(overtimeRequests)
            .set(change)
            .where(eq(overtimeRequests.id, requestId)),
        );

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'overtime_requests_immutable_ck',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should accept deciding a pending overtime request when only the status and review fields change',
      async () => {
        const database = await startDatabase();
        const accountId = randomUUID();
        const requestId = await insertOvertime(database, {
          attendanceDayId: await insertWorkingDay(database, accountId),
          requestedByAccountId: accountId,
        });

        await database.db
          .update(overtimeRequests)
          .set(APPROVED_REVIEW)
          .where(eq(overtimeRequests.id, requestId));

        const [row] = await database.db
          .select({ status: overtimeRequests.status })
          .from(overtimeRequests)
          .where(eq(overtimeRequests.id, requestId));
        expect(row?.status).toBe('APPROVED');
      },
      TEST_TIMEOUT_MS,
    );

    it.each([
      {
        label: 'return to PENDING',
        change: {
          status: 'PENDING',
          reviewedByAccountId: null,
          reviewedAt: null,
          reviewReason: null,
        },
      },
      {
        label: 'change the decision',
        change: { ...REJECTED_REVIEW },
      },
      {
        label: 'change the reviewer',
        change: { reviewedByAccountId: randomUUID() },
      },
    ])(
      'should reject an attempt to $label of a decided overtime request with check violation 23514',
      async ({ change }) => {
        const database = await startDatabase();
        const accountId = randomUUID();
        const requestId = await insertOvertime(
          database,
          {
            attendanceDayId: await insertWorkingDay(database, accountId),
            requestedByAccountId: accountId,
          },
          APPROVED_REVIEW,
        );

        const failure = await failureOf(
          database.db
            .update(overtimeRequests)
            .set(change)
            .where(eq(overtimeRequests.id, requestId)),
        );

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'overtime_requests_terminal_ck',
        });
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('correction pending uniqueness', () => {
    it(
      'should reject a second pending correction for the same day with unique violation 23505',
      async () => {
        const database = await startDatabase();
        const accountId = randomUUID();
        const ownership = {
          attendanceDayId: await insertWorkingDay(database, accountId),
          requestedByAccountId: accountId,
        };
        await insertCorrection(database, ownership);

        const failure = await failureOf(insertCorrection(database, ownership));

        expect(failure).toEqual({
          sqlState: UNIQUE_VIOLATION,
          constraint: 'attendance_adjustment_requests_pending_day_uq',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it.each([
      { label: 'rejected', review: REJECTED_REVIEW },
      { label: 'approved', review: { ...APPROVED_REVIEW, appliedRevision: 2 } },
    ])(
      'should accept a new pending correction for the same day when the earlier one was $label',
      async ({ review }) => {
        const database = await startDatabase();
        const accountId = randomUUID();
        const ownership = {
          attendanceDayId: await insertWorkingDay(database, accountId),
          requestedByAccountId: accountId,
        };
        await insertCorrection(database, ownership, review);

        await insertCorrection(database, ownership);

        const rows = await database.db
          .select({ id: attendanceAdjustmentRequests.id })
          .from(attendanceAdjustmentRequests)
          .where(eq(attendanceAdjustmentRequests.requestedByAccountId, accountId));
        expect(rows).toHaveLength(2);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should accept a pending correction for a different day of the same employee',
      async () => {
        const database = await startDatabase();
        const accountId = randomUUID();
        await insertCorrection(database, {
          attendanceDayId: await insertWorkingDay(database, accountId, '2026-10-29'),
          requestedByAccountId: accountId,
        });

        await insertCorrection(database, {
          attendanceDayId: await insertWorkingDay(database, accountId, '2026-10-30'),
          requestedByAccountId: accountId,
        });

        const rows = await database.db
          .select({ id: attendanceAdjustmentRequests.id })
          .from(attendanceAdjustmentRequests);
        expect(rows).toHaveLength(2);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('correction checks', () => {
    it(
      'should reject a requested clock-out before the requested clock-in with check violation 23514',
      async () => {
        const database = await startDatabase();
        const accountId = randomUUID();
        const ownership = {
          attendanceDayId: await insertWorkingDay(database, accountId),
          requestedByAccountId: accountId,
        };

        const failure = await failureOf(
          insertCorrection(database, ownership, {
            requestedCheckinAt: SCHEDULED_END,
            requestedCheckoutAt: SCHEDULED_START,
          }),
        );

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'attendance_adjustment_requests_checkout_order_ck',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reject a requested clock-out without a requested clock-in with check violation 23514',
      async () => {
        const database = await startDatabase();
        const accountId = randomUUID();
        const ownership = {
          attendanceDayId: await insertWorkingDay(database, accountId),
          requestedByAccountId: accountId,
        };

        const failure = await failureOf(
          insertCorrection(database, ownership, { requestedCheckinAt: null }),
        );

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'attendance_adjustment_requests_checkout_needs_checkin_ck',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should accept a requested clock-out equal to the requested clock-in',
      async () => {
        const database = await startDatabase();
        const accountId = randomUUID();
        const ownership = {
          attendanceDayId: await insertWorkingDay(database, accountId),
          requestedByAccountId: accountId,
        };

        const requestId = await insertCorrection(database, ownership, {
          requestedCheckinAt: SCHEDULED_START,
          requestedCheckoutAt: SCHEDULED_START,
        });

        const [row] = await database.db
          .select({ id: attendanceAdjustmentRequests.id })
          .from(attendanceAdjustmentRequests)
          .where(eq(attendanceAdjustmentRequests.id, requestId));
        expect(row?.id).toBe(requestId);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reject a base revision below 1 with check violation 23514',
      async () => {
        const database = await startDatabase();
        const accountId = randomUUID();
        const ownership = {
          attendanceDayId: await insertWorkingDay(database, accountId),
          requestedByAccountId: accountId,
        };

        const failure = await failureOf(insertCorrection(database, ownership, { baseRevision: 0 }));

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'attendance_adjustment_requests_base_revision_ck',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reject an applied revision on a pending correction with check violation 23514',
      async () => {
        const database = await startDatabase();
        const accountId = randomUUID();
        const ownership = {
          attendanceDayId: await insertWorkingDay(database, accountId),
          requestedByAccountId: accountId,
        };

        const failure = await failureOf(
          insertCorrection(database, ownership, { appliedRevision: 2 }),
        );

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'attendance_adjustment_requests_applied_revision_ck',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reject an approved correction without an applied revision with check violation 23514',
      async () => {
        const database = await startDatabase();
        const accountId = randomUUID();
        const ownership = {
          attendanceDayId: await insertWorkingDay(database, accountId),
          requestedByAccountId: accountId,
        };

        const failure = await failureOf(
          insertCorrection(database, ownership, { ...APPROVED_REVIEW, appliedRevision: null }),
        );

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'attendance_adjustment_requests_applied_revision_ck',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should accept an approved correction with an applied revision',
      async () => {
        const database = await startDatabase();
        const accountId = randomUUID();
        const ownership = {
          attendanceDayId: await insertWorkingDay(database, accountId),
          requestedByAccountId: accountId,
        };

        const requestId = await insertCorrection(database, ownership, {
          ...APPROVED_REVIEW,
          appliedRevision: 2,
        });

        const [row] = await database.db
          .select({ appliedRevision: attendanceAdjustmentRequests.appliedRevision })
          .from(attendanceAdjustmentRequests)
          .where(eq(attendanceAdjustmentRequests.id, requestId));
        expect(row?.appliedRevision).toBe(2);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reject a rejection without a review reason with check violation 23514',
      async () => {
        const database = await startDatabase();
        const accountId = randomUUID();
        const ownership = {
          attendanceDayId: await insertWorkingDay(database, accountId),
          requestedByAccountId: accountId,
        };

        const failure = await failureOf(
          insertCorrection(database, ownership, { ...REJECTED_REVIEW, reviewReason: null }),
        );

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'attendance_adjustment_requests_rejection_reason_ck',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reject a review by the requester with check violation 23514',
      async () => {
        const database = await startDatabase();
        const accountId = randomUUID();
        const ownership = {
          attendanceDayId: await insertWorkingDay(database, accountId),
          requestedByAccountId: accountId,
        };

        const failure = await failureOf(
          insertCorrection(database, ownership, {
            ...APPROVED_REVIEW,
            reviewedByAccountId: accountId,
            appliedRevision: 2,
          }),
        );

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'attendance_adjustment_requests_self_review_ck',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reject a requested status that is not a DAY status with foreign key violation 23503',
      async () => {
        const database = await startDatabase();
        const accountId = randomUUID();
        const ownership = {
          attendanceDayId: await insertWorkingDay(database, accountId),
          requestedByAccountId: accountId,
        };

        const failure = await failureOf(
          insertCorrection(database, ownership, {
            requestedDayStatusId: await statusIdOf(database, 'PENDING_CHECKIN'),
          }),
        );

        expect(failure).toEqual({
          sqlState: FOREIGN_KEY_VIOLATION,
          constraint: 'attendance_adjustment_requests_requested_day_status_fk',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reject a correction for a day owned by another account with foreign key violation 23503',
      async () => {
        const database = await startDatabase();
        const attendanceDayId = await insertWorkingDay(database, randomUUID());

        const failure = await failureOf(
          insertCorrection(database, { attendanceDayId, requestedByAccountId: randomUUID() }),
        );

        expect(failure).toEqual({
          sqlState: FOREIGN_KEY_VIOLATION,
          constraint: 'attendance_adjustment_requests_attendance_day_fk',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reject a second correction with the same idempotency key for the same employee with unique violation 23505',
      async () => {
        const database = await startDatabase();
        const accountId = randomUUID();
        const ownership = {
          attendanceDayId: await insertWorkingDay(database, accountId),
          requestedByAccountId: accountId,
        };
        const idempotencyKey = randomUUID();
        await insertCorrection(database, ownership, { idempotencyKey, ...REJECTED_REVIEW });

        const failure = await failureOf(insertCorrection(database, ownership, { idempotencyKey }));

        expect(failure).toEqual({
          sqlState: UNIQUE_VIOLATION,
          constraint: 'attendance_adjustment_requests_requester_idempotency_uq',
        });
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('correction immutability', () => {
    it.each([
      { column: 'requestedCheckoutAt', change: { requestedCheckoutAt: null } },
      { column: 'baseRevision', change: { baseRevision: 2 } },
      { column: 'reason', change: { reason: 'Different reason' } },
    ])(
      'should reject an UPDATE of $column on a pending correction with check violation 23514',
      async ({ change }) => {
        const database = await startDatabase();
        const accountId = randomUUID();
        const requestId = await insertCorrection(database, {
          attendanceDayId: await insertWorkingDay(database, accountId),
          requestedByAccountId: accountId,
        });

        const failure = await failureOf(
          database.db
            .update(attendanceAdjustmentRequests)
            .set(change)
            .where(eq(attendanceAdjustmentRequests.id, requestId)),
        );

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'attendance_adjustment_requests_immutable_ck',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reject an UPDATE of the requested day status on a pending correction with check violation 23514',
      async () => {
        const database = await startDatabase();
        const accountId = randomUUID();
        const requestId = await insertCorrection(database, {
          attendanceDayId: await insertWorkingDay(database, accountId),
          requestedByAccountId: accountId,
        });

        const failure = await failureOf(
          database.db
            .update(attendanceAdjustmentRequests)
            .set({ requestedDayStatusId: await statusIdOf(database, 'SICK_LEAVE') })
            .where(eq(attendanceAdjustmentRequests.id, requestId)),
        );

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'attendance_adjustment_requests_immutable_ck',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reject a change to the applied revision of a decided correction with check violation 23514',
      async () => {
        const database = await startDatabase();
        const accountId = randomUUID();
        const requestId = await insertCorrection(
          database,
          {
            attendanceDayId: await insertWorkingDay(database, accountId),
            requestedByAccountId: accountId,
          },
          { ...APPROVED_REVIEW, appliedRevision: 2 },
        );

        const failure = await failureOf(
          database.db
            .update(attendanceAdjustmentRequests)
            .set({ appliedRevision: 3 })
            .where(eq(attendanceAdjustmentRequests.id, requestId)),
        );

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'attendance_adjustment_requests_terminal_ck',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should reject a second decision on a rejected correction with check violation 23514',
      async () => {
        const database = await startDatabase();
        const accountId = randomUUID();
        const requestId = await insertCorrection(
          database,
          {
            attendanceDayId: await insertWorkingDay(database, accountId),
            requestedByAccountId: accountId,
          },
          REJECTED_REVIEW,
        );

        const failure = await failureOf(
          database.db
            .update(attendanceAdjustmentRequests)
            .set({ ...APPROVED_REVIEW, appliedRevision: 2 })
            .where(eq(attendanceAdjustmentRequests.id, requestId)),
        );

        expect(failure).toEqual({
          sqlState: CHECK_VIOLATION,
          constraint: 'attendance_adjustment_requests_terminal_ck',
        });
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('migration role', () => {
    it(
      'should apply the request migrations as a non-superuser database owner when btree_gist is trusted',
      async () => {
        // The role and database names are built from hex digits only, so the raw SQL below has no injection surface.
        const suffix = randomBytes(8).toString('hex');
        const roleName = `attendance_owner_${suffix}`;
        const password = randomBytes(16).toString('hex');
        const databaseName = `attendance_owned_${suffix}`;
        const admin = createDatabase(container.getConnectionUri());
        try {
          await admin.db.execute(sql.raw(`create role ${roleName} login password '${password}'`));
          await admin.db.execute(sql.raw(`create database ${databaseName} owner ${roleName}`));
        } finally {
          await admin.close();
        }
        const ownerUrl = new URL(container.getConnectionUri());
        ownerUrl.username = roleName;
        ownerUrl.password = password;
        ownerUrl.pathname = `/${databaseName}`;
        const owner = createDatabase(ownerUrl.toString());
        openDatabases.push(owner);

        await runMigrations(owner, MIGRATIONS_FOLDER);

        const result = await owner.db.execute<{ is_superuser: boolean; has_btree_gist: boolean }>(
          sql`select (select rolsuper from pg_roles where rolname = current_user) as is_superuser,
                     exists (select 1 from pg_extension where extname = 'btree_gist') as has_btree_gist`,
        );
        expect(result.rows).toEqual([{ is_superuser: false, has_btree_gist: true }]);
      },
      TEST_TIMEOUT_MS,
    );
  });
});
