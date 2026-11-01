import { attendanceDayStatusSchema } from '@dexa/contracts';
import type { Database } from '@dexa/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, gte, lte, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DATABASE } from '../infrastructure/db/database.token.js';
import {
  attendanceAdjustmentRequests,
  attendanceDays,
  masterAttendanceStatuses,
} from '../infrastructure/db/schema.js';
import type { RequestReviewQueueCriteria } from '../requests/request-review-queue.criteria.js';
import {
  requestedStatuses,
  storedCorrectionRequestColumns,
  toStoredCorrectionRequest,
} from './correction-request.repository.js';
import type {
  ICorrectionRequestReviewReader,
  StoredCorrectionReviewPage,
  StoredCorrectionReviewRequest,
} from './correction-request-review.repository.interface.js';

// The day's DAY status is read through its own alias of the status master, as the requested outcome is.
const currentDayStatuses = alias(masterAttendanceStatuses, 'current_day_status');

// A plain read with no row lock. The (status, created_at) index serves the queue order and the status filter
// (DATABASE §5.8). The day joins supply the business date for the range and the current times.
@Injectable()
export class CorrectionRequestReviewRepository implements ICorrectionRequestReviewReader {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findReviewPage(criteria: RequestReviewQueueCriteria): Promise<StoredCorrectionReviewPage> {
    const condition = buildReviewCondition(criteria);
    const rows = await this.database.db
      .select({
        ...storedCorrectionRequestColumns,
        requesterAccountId: attendanceAdjustmentRequests.requestedByAccountId,
        currentCheckinAt: attendanceDays.effectiveCheckinAt,
        currentCheckoutAt: attendanceDays.effectiveCheckoutAt,
        currentDayStatus: currentDayStatuses.code,
      })
      .from(attendanceAdjustmentRequests)
      .innerJoin(
        attendanceDays,
        eq(attendanceDays.id, attendanceAdjustmentRequests.attendanceDayId),
      )
      .innerJoin(
        requestedStatuses,
        eq(requestedStatuses.id, attendanceAdjustmentRequests.requestedDayStatusId),
      )
      .innerJoin(currentDayStatuses, eq(currentDayStatuses.id, attendanceDays.dayStatusId))
      .where(condition)
      .orderBy(asc(attendanceAdjustmentRequests.createdAt), asc(attendanceAdjustmentRequests.id))
      .limit(criteria.pageSize)
      .offset((criteria.page - 1) * criteria.pageSize);
    const [totals] = await this.database.db
      .select({ total: count() })
      .from(attendanceAdjustmentRequests)
      .innerJoin(
        attendanceDays,
        eq(attendanceDays.id, attendanceAdjustmentRequests.attendanceDayId),
      )
      .where(condition);
    return { records: rows.map(toStoredCorrectionReviewRequest), totalItems: totals?.total ?? 0 };
  }
}

// The outcome, status, and day status are varchars until they are narrowed where the row is read.
type CorrectionReviewRow = Omit<
  StoredCorrectionReviewRequest,
  'requestedOutcome' | 'status' | 'currentDayStatus'
> & {
  readonly requestedOutcome: string;
  readonly status: string;
  readonly currentDayStatus: string;
};

function toStoredCorrectionReviewRequest(row: CorrectionReviewRow): StoredCorrectionReviewRequest {
  const {
    requesterAccountId,
    currentCheckinAt,
    currentCheckoutAt,
    currentDayStatus,
    ...storedRow
  } = row;
  return {
    ...toStoredCorrectionRequest(storedRow),
    requesterAccountId,
    currentCheckinAt,
    currentCheckoutAt,
    currentDayStatus: attendanceDayStatusSchema.parse(currentDayStatus),
  };
}

function buildReviewCondition(criteria: RequestReviewQueueCriteria): SQL | undefined {
  return and(
    eq(attendanceAdjustmentRequests.status, criteria.status),
    criteria.requesterAccountId === undefined
      ? undefined
      : eq(attendanceAdjustmentRequests.requestedByAccountId, criteria.requesterAccountId),
    criteria.from === undefined ? undefined : gte(attendanceDays.businessDate, criteria.from),
    criteria.to === undefined ? undefined : lte(attendanceDays.businessDate, criteria.to),
  );
}
