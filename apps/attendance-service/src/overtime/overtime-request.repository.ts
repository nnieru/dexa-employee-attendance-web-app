import { DomainError, isExclusionViolation, readUniqueViolationConstraint } from '@dexa/common';
import { requestStatusSchema } from '@dexa/contracts';
import type { Database } from '@dexa/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DATABASE } from '../infrastructure/db/database.token.js';
import { wrapStorageError } from '../infrastructure/db/storage-errors.js';
import { attendanceDays, overtimeRequests } from '../infrastructure/db/schema.js';
import { REQUEST_STATUS } from '../requests/request-decision.rules.js';
import { createTransactionScope, type PunchRunner } from '../punches/punch.repository.js';
import {
  OvertimeIdempotencyKeyRaceError,
  OvertimeOverlapError,
} from './overtime-request.errors.js';
import type {
  IOvertimeRequestRepository,
  IOvertimeRequestTransaction,
  NewOvertimeRequest,
  StoredOvertimeRequest,
} from './overtime-request.repository.interface.js';

// Named in migration 0004, so a duplicate key is recognized by this name and not by any other unique violation.
const REQUESTER_IDEMPOTENCY_CONSTRAINT = 'overtime_requests_requester_idempotency_uq';
// The statuses that hold minutes of the daily cap (PRD OT-4). Rejected requests release their minutes.
const CAPPED_STATUSES = [REQUEST_STATUS.PENDING, REQUEST_STATUS.APPROVED] as const;

@Injectable()
export class OvertimeRequestRepository implements IOvertimeRequestRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async runInTransaction<TResult>(
    work: (transaction: IOvertimeRequestTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    try {
      return await this.database.db.transaction((transaction) =>
        work(createOvertimeTransactionScope(transaction)),
      );
    } catch (error: unknown) {
      if (error instanceof DomainError || error instanceof OvertimeIdempotencyKeyRaceError) {
        throw error;
      }
      throw wrapStorageError(error, 'Could not record the overtime request.');
    }
  }
}

// The day reads and writes are the ones that punches use (T-REQ-03), so the schedule snapshot is written in one place.
function createOvertimeTransactionScope(runner: PunchRunner): IOvertimeRequestTransaction {
  const dayScope = createTransactionScope(runner);
  return {
    findScheduleInEffect: dayScope.findScheduleInEffect,
    findCalendarException: dayScope.findCalendarException,
    insertDayIfMissing: dayScope.insertDayIfMissing,
    findDayForUpdate: dayScope.findDayForUpdate,
    findRequestByIdempotencyKey: (accountId, idempotencyKey) =>
      findRequestByIdempotencyKey(runner, accountId, idempotencyKey),
    findActiveOvertimeMinutes: (attendanceDayId) =>
      findActiveOvertimeMinutes(runner, attendanceDayId),
    insertOvertimeRequest: (request) => insertOvertimeRequest(runner, request),
  };
}

async function findRequestByIdempotencyKey(
  runner: PunchRunner,
  accountId: string,
  idempotencyKey: string,
): Promise<StoredOvertimeRequest | undefined> {
  const [row] = await runner
    .select({
      id: overtimeRequests.id,
      businessDate: attendanceDays.businessDate,
      startAt: overtimeRequests.requestedStartAt,
      endAt: overtimeRequests.requestedEndAt,
      reason: overtimeRequests.reason,
      status: overtimeRequests.status,
      createdAt: overtimeRequests.createdAt,
    })
    .from(overtimeRequests)
    .innerJoin(attendanceDays, eq(attendanceDays.id, overtimeRequests.attendanceDayId))
    .where(
      and(
        eq(overtimeRequests.requestedByAccountId, accountId),
        eq(overtimeRequests.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);
  if (row === undefined) return undefined;
  return { ...row, status: requestStatusSchema.parse(row.status) };
}

// The sum is in minutes with the seconds kept, so the rule compares the exact interval lengths (no rounding, PRD OT-4).
async function findActiveOvertimeMinutes(
  runner: PunchRunner,
  attendanceDayId: string,
): Promise<number> {
  const [row] = await runner
    .select({
      minutes:
        sql<number>`coalesce(sum(extract(epoch from (${overtimeRequests.requestedEndAt} - ${overtimeRequests.requestedStartAt}))), 0) / 60`.mapWith(
          Number,
        ),
    })
    .from(overtimeRequests)
    .where(
      and(
        eq(overtimeRequests.attendanceDayId, attendanceDayId),
        inArray(overtimeRequests.status, CAPPED_STATUSES),
      ),
    );
  return row?.minutes ?? 0;
}

async function insertOvertimeRequest(
  runner: PunchRunner,
  request: NewOvertimeRequest,
): Promise<StoredOvertimeRequest> {
  try {
    const [row] = await runner
      .insert(overtimeRequests)
      .values({
        attendanceDayId: request.attendanceDayId,
        requestedByAccountId: request.accountId,
        idempotencyKey: request.idempotencyKey,
        reason: request.reason,
        requestedStartAt: request.startAt,
        requestedEndAt: request.endAt,
      })
      .returning({
        id: overtimeRequests.id,
        createdAt: overtimeRequests.createdAt,
        status: overtimeRequests.status,
      });
    if (row === undefined) throw new Error('The overtime request insert returned no row.');
    return {
      id: row.id,
      businessDate: request.businessDate,
      startAt: request.startAt,
      endAt: request.endAt,
      reason: request.reason,
      status: requestStatusSchema.parse(row.status),
      createdAt: row.createdAt,
    };
  } catch (error: unknown) {
    if (isExclusionViolation(error)) throw new OvertimeOverlapError();
    if (readUniqueViolationConstraint(error) === REQUESTER_IDEMPOTENCY_CONSTRAINT) {
      throw new OvertimeIdempotencyKeyRaceError();
    }
    throw error;
  }
}
