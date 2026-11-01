import { DomainError, readUniqueViolationConstraint } from '@dexa/common';
import { requestStatusSchema, requestedCorrectionDayStatusSchema } from '@dexa/contracts';
import type { Database } from '@dexa/db';
import { Inject, Injectable } from '@nestjs/common';
import { alias } from 'drizzle-orm/pg-core';
import { and, eq } from 'drizzle-orm';
import { DATABASE } from '../infrastructure/db/database.token.js';
import { wrapStorageError } from '../infrastructure/db/storage-errors.js';
import {
  attendanceAdjustmentRequests,
  attendanceDays,
  masterAttendanceStatuses,
} from '../infrastructure/db/schema.js';
import { createTransactionScope, type PunchRunner } from '../punches/punch.repository.js';
import {
  CorrectionAlreadyPendingError,
  CorrectionIdempotencyKeyRaceError,
} from './correction-request.errors.js';
import type {
  DayRevisionSnapshot,
  ICorrectionRequestRepository,
  ICorrectionRequestTransaction,
  NewCorrectionRequest,
  StoredCorrectionRequest,
} from './correction-request.repository.interface.js';

// Named in migration 0004, so a duplicate key is recognized by this name and not by any other unique violation.
const REQUESTER_IDEMPOTENCY_CONSTRAINT = 'attendance_adjustment_requests_requester_idempotency_uq';
// The partial unique index that keeps one PENDING correction per day (COR-4, DATABASE §5.8).
const PENDING_DAY_CONSTRAINT = 'attendance_adjustment_requests_pending_day_uq';
const DAY_STATUS_CATEGORY = 'DAY';

// The requested outcome is stored as a DAY status, so its code is read through a second alias of the status master.
const requestedStatuses = alias(masterAttendanceStatuses, 'requested_status');

@Injectable()
export class CorrectionRequestRepository implements ICorrectionRequestRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async runInTransaction<TResult>(
    work: (transaction: ICorrectionRequestTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    try {
      return await this.database.db.transaction((transaction) =>
        work(createCorrectionTransactionScope(transaction)),
      );
    } catch (error: unknown) {
      if (error instanceof DomainError || error instanceof CorrectionIdempotencyKeyRaceError) {
        throw error;
      }
      throw wrapStorageError(error, 'Could not record the correction request.');
    }
  }
}

// The day reads and writes are the ones that punches use (T-REQ-03), so the schedule snapshot is written in one place.
function createCorrectionTransactionScope(runner: PunchRunner): ICorrectionRequestTransaction {
  const dayScope = createTransactionScope(runner);
  return {
    findScheduleInEffect: dayScope.findScheduleInEffect,
    findCalendarException: dayScope.findCalendarException,
    insertDayIfMissing: dayScope.insertDayIfMissing,
    findDayForUpdate: dayScope.findDayForUpdate,
    findRequestByIdempotencyKey: (accountId, idempotencyKey) =>
      findRequestByIdempotencyKey(runner, accountId, idempotencyKey),
    hasPendingCorrection: (attendanceDayId) => hasPendingCorrection(runner, attendanceDayId),
    findDayRevisionSnapshot: (attendanceDayId) => findDayRevisionSnapshot(runner, attendanceDayId),
    insertCorrectionRequest: (request) => insertCorrectionRequest(runner, request),
  };
}

async function findRequestByIdempotencyKey(
  runner: PunchRunner,
  accountId: string,
  idempotencyKey: string,
): Promise<StoredCorrectionRequest | undefined> {
  const [row] = await runner
    .select({
      id: attendanceAdjustmentRequests.id,
      businessDate: attendanceDays.businessDate,
      requestedOutcome: requestedStatuses.code,
      requestedCheckinAt: attendanceAdjustmentRequests.requestedCheckinAt,
      requestedCheckoutAt: attendanceAdjustmentRequests.requestedCheckoutAt,
      reason: attendanceAdjustmentRequests.reason,
      status: attendanceAdjustmentRequests.status,
      createdAt: attendanceAdjustmentRequests.createdAt,
    })
    .from(attendanceAdjustmentRequests)
    .innerJoin(attendanceDays, eq(attendanceDays.id, attendanceAdjustmentRequests.attendanceDayId))
    .innerJoin(
      requestedStatuses,
      eq(requestedStatuses.id, attendanceAdjustmentRequests.requestedDayStatusId),
    )
    .where(
      and(
        eq(attendanceAdjustmentRequests.requestedByAccountId, accountId),
        eq(attendanceAdjustmentRequests.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);
  if (row === undefined) return undefined;
  return {
    ...row,
    requestedOutcome: requestedCorrectionDayStatusSchema.parse(row.requestedOutcome),
    status: requestStatusSchema.parse(row.status),
  };
}

async function hasPendingCorrection(
  runner: PunchRunner,
  attendanceDayId: string,
): Promise<boolean> {
  const [row] = await runner
    .select({ id: attendanceAdjustmentRequests.id })
    .from(attendanceAdjustmentRequests)
    .where(
      and(
        eq(attendanceAdjustmentRequests.attendanceDayId, attendanceDayId),
        eq(attendanceAdjustmentRequests.status, 'PENDING'),
      ),
    )
    .limit(1);
  return row !== undefined;
}

async function findDayRevisionSnapshot(
  runner: PunchRunner,
  attendanceDayId: string,
): Promise<DayRevisionSnapshot> {
  const [row] = await runner
    .select({
      revision: attendanceDays.revision,
      effectiveCheckinAt: attendanceDays.effectiveCheckinAt,
      effectiveCheckoutAt: attendanceDays.effectiveCheckoutAt,
      dayStatusId: attendanceDays.dayStatusId,
    })
    .from(attendanceDays)
    .where(eq(attendanceDays.id, attendanceDayId))
    .limit(1);
  if (row === undefined) throw new Error('The attendance day to snapshot was not found.');
  return row;
}

async function insertCorrectionRequest(
  runner: PunchRunner,
  request: NewCorrectionRequest,
): Promise<StoredCorrectionRequest> {
  const requestedDayStatusId = await findDayStatusId(runner, request.requestedOutcome);
  try {
    const [row] = await runner
      .insert(attendanceAdjustmentRequests)
      .values({
        attendanceDayId: request.attendanceDayId,
        requestedByAccountId: request.accountId,
        idempotencyKey: request.idempotencyKey,
        reason: request.reason,
        baseRevision: request.beforeDay.revision,
        beforeCheckinAt: request.beforeDay.effectiveCheckinAt,
        beforeCheckoutAt: request.beforeDay.effectiveCheckoutAt,
        beforeDayStatusId: request.beforeDay.dayStatusId,
        requestedCheckinAt: request.requestedCheckinAt,
        requestedCheckoutAt: request.requestedCheckoutAt,
        requestedDayStatusId,
      })
      .returning({
        id: attendanceAdjustmentRequests.id,
        status: attendanceAdjustmentRequests.status,
        createdAt: attendanceAdjustmentRequests.createdAt,
      });
    if (row === undefined) throw new Error('The correction request insert returned no row.');
    return {
      id: row.id,
      businessDate: request.businessDate,
      requestedOutcome: request.requestedOutcome,
      requestedCheckinAt: request.requestedCheckinAt,
      requestedCheckoutAt: request.requestedCheckoutAt,
      reason: request.reason,
      status: requestStatusSchema.parse(row.status),
      createdAt: row.createdAt,
    };
  } catch (error: unknown) {
    const constraint = readUniqueViolationConstraint(error);
    if (constraint === PENDING_DAY_CONSTRAINT) throw new CorrectionAlreadyPendingError();
    if (constraint === REQUESTER_IDEMPOTENCY_CONSTRAINT) {
      throw new CorrectionIdempotencyKeyRaceError();
    }
    throw error;
  }
}

// The DAY status codes are seeded by migration 0003 (DATABASE §5.1). A missing code means the schema is broken.
async function findDayStatusId(runner: PunchRunner, code: string): Promise<string> {
  const [row] = await runner
    .select({ id: masterAttendanceStatuses.id })
    .from(masterAttendanceStatuses)
    .where(
      and(
        eq(masterAttendanceStatuses.code, code),
        eq(masterAttendanceStatuses.category, DAY_STATUS_CATEGORY),
      ),
    )
    .limit(1);
  if (row === undefined) throw new Error(`The attendance status ${code} is not seeded.`);
  return row.id;
}
