import { DomainError } from '@dexa/common';
import type { Database } from '@dexa/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { AppliedCorrectionDay } from './correction-apply.rules.js';
import { DATABASE } from '../infrastructure/db/database.token.js';
import { wrapStorageError } from '../infrastructure/db/storage-errors.js';
import {
  attendanceAdjustmentRequests,
  attendanceDays,
  workSchedules,
} from '../infrastructure/db/schema.js';
import { REQUEST_STATUS } from '../requests/request-decision.rules.js';
import { RequestAlreadyDecidedError } from '../requests/request-decision.errors.js';
import { findStatusId, toDaySchedule, type PunchRunner } from '../punches/punch.repository.js';
import {
  requestedStatuses,
  storedCorrectionRequestColumns,
  toStoredCorrectionRequest,
} from './correction-request.repository.js';
import {
  type ICorrectionRequestDecisionRepository,
  type ICorrectionRequestDecisionTransaction,
  type LockedCorrectionDay,
  type LockedCorrectionRequest,
  type NewRequestDecision,
} from './correction-request-decision.repository.interface.js';

// The decision locks the request first and the day second, the order that every approval follows. Punches lock only the
// day, so the two orders never wait on each other in a cycle.
@Injectable()
export class CorrectionRequestDecisionRepository implements ICorrectionRequestDecisionRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async runInTransaction<TResult>(
    work: (transaction: ICorrectionRequestDecisionTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    try {
      return await this.database.db.transaction((transaction) =>
        work(createDecisionTransactionScope(transaction)),
      );
    } catch (error: unknown) {
      if (error instanceof DomainError) throw error;
      throw wrapStorageError(error, 'Could not record the correction request decision.');
    }
  }
}

function createDecisionTransactionScope(
  runner: PunchRunner,
): ICorrectionRequestDecisionTransaction {
  return {
    findRequestForUpdate: (requestId) => findRequestForUpdate(runner, requestId),
    findDayForUpdate: (attendanceDayId) => findDayForUpdate(runner, attendanceDayId),
    applyDayValues: (dayId, values) => applyDayValues(runner, dayId, values),
    recordDecision: (decision) => recordDecision(runner, decision),
  };
}

// The row lock is taken on the request only. The joined day supplies the business date, and the requested outcome
// comes from its status join, as in every correction read.
async function findRequestForUpdate(
  runner: PunchRunner,
  requestId: string,
): Promise<LockedCorrectionRequest | undefined> {
  const [row] = await runner
    .select({
      ...storedCorrectionRequestColumns,
      requesterAccountId: attendanceAdjustmentRequests.requestedByAccountId,
      attendanceDayId: attendanceAdjustmentRequests.attendanceDayId,
      baseRevision: attendanceAdjustmentRequests.baseRevision,
    })
    .from(attendanceAdjustmentRequests)
    .innerJoin(attendanceDays, eq(attendanceDays.id, attendanceAdjustmentRequests.attendanceDayId))
    .innerJoin(
      requestedStatuses,
      eq(requestedStatuses.id, attendanceAdjustmentRequests.requestedDayStatusId),
    )
    .where(eq(attendanceAdjustmentRequests.id, requestId))
    .limit(1)
    .for('update', { of: attendanceAdjustmentRequests });
  if (row === undefined) return undefined;
  const { requesterAccountId, attendanceDayId, baseRevision, ...storedRow } = row;
  return {
    ...toStoredCorrectionRequest(storedRow),
    requesterAccountId,
    attendanceDayId,
    baseRevision,
  };
}

// The day's schedule is joined for its grace minutes, which the snapshot keeps fixed while the version is in effect
// (DATABASE §5.2). FOR UPDATE locks only the day row.
async function findDayForUpdate(
  runner: PunchRunner,
  attendanceDayId: string,
): Promise<LockedCorrectionDay | undefined> {
  const [row] = await runner
    .select({
      dayId: attendanceDays.id,
      revision: attendanceDays.revision,
      timezone: attendanceDays.businessTimezone,
      isWorkingDay: attendanceDays.isWorkingDay,
      scheduledStartAt: attendanceDays.scheduledStartAt,
      scheduledEndAt: attendanceDays.scheduledEndAt,
      lateCheckinGraceMinutes: workSchedules.lateCheckinGraceMinutes,
      earlyCheckoutGraceMinutes: workSchedules.earlyCheckoutGraceMinutes,
      lateCheckoutGraceMinutes: workSchedules.lateCheckoutGraceMinutes,
    })
    .from(attendanceDays)
    .innerJoin(workSchedules, eq(workSchedules.id, attendanceDays.workScheduleId))
    .where(eq(attendanceDays.id, attendanceDayId))
    .limit(1)
    .for('update', { of: attendanceDays });
  if (row === undefined) return undefined;
  return { dayId: row.dayId, revision: row.revision, daySchedule: toDaySchedule(row) };
}

// revision is incremented in SQL and returned, so the revision the approval produced is the one stored on the request.
async function applyDayValues(
  runner: PunchRunner,
  dayId: string,
  values: AppliedCorrectionDay,
): Promise<number> {
  const dayStatusId = await findStatusId(runner, values.dayStatusCode);
  const checkinStatusId = await findStatusId(runner, values.checkinStatusCode);
  const checkoutStatusId = await findStatusId(runner, values.checkoutStatusCode);
  const [row] = await runner
    .update(attendanceDays)
    .set({
      dayStatusId,
      checkinStatusId,
      checkoutStatusId,
      effectiveCheckinAt: values.effectiveCheckinAt,
      effectiveCheckoutAt: values.effectiveCheckoutAt,
      revision: sql`${attendanceDays.revision} + 1`,
    })
    .where(eq(attendanceDays.id, dayId))
    .returning({ revision: attendanceDays.revision });
  if (row === undefined) throw new Error('The attendance day to correct was not found.');
  return row.revision;
}

// The PENDING condition is a second guard behind the row lock. A decided request matches no row, so it is not written.
async function recordDecision(runner: PunchRunner, decision: NewRequestDecision): Promise<void> {
  const updatedRows = await runner
    .update(attendanceAdjustmentRequests)
    .set({
      status: decision.status,
      reviewedByAccountId: decision.reviewerAccountId,
      reviewedAt: decision.reviewedAt,
      reviewReason: decision.reviewReason,
      appliedRevision: decision.appliedRevision,
    })
    .where(
      and(
        eq(attendanceAdjustmentRequests.id, decision.requestId),
        eq(attendanceAdjustmentRequests.status, REQUEST_STATUS.PENDING),
      ),
    )
    .returning({ id: attendanceAdjustmentRequests.id });
  if (updatedRows.length === 0) throw new RequestAlreadyDecidedError();
}
