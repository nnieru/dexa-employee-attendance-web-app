import type { Database } from '@dexa/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm';
import { DATABASE } from '../infrastructure/db/database.token.js';
import { attendanceDays, overtimeRequests } from '../infrastructure/db/schema.js';
import type { RequestReviewQueueCriteria } from '../requests/request-review-queue.criteria.js';
import {
  storedOvertimeRequestColumns,
  toStoredOvertimeRequest,
} from './overtime-request.repository.js';
import type {
  IOvertimeRequestReviewReader,
  StoredOvertimeReviewPage,
  StoredOvertimeReviewRequest,
} from './overtime-request-review.repository.interface.js';

// A plain read with no row lock. The (status, created_at) index serves the queue order and the status filter
// (DATABASE §5.6). The approved minutes are summed once per page, for the days on that page, through the
// (attendance_day_id, created_at) index (DATABASE §5.6).
@Injectable()
export class OvertimeRequestReviewRepository implements IOvertimeRequestReviewReader {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findReviewPage(criteria: RequestReviewQueueCriteria): Promise<StoredOvertimeReviewPage> {
    const condition = buildReviewCondition(criteria);
    const rows = await this.database.db
      .select({
        ...storedOvertimeRequestColumns,
        attendanceDayId: overtimeRequests.attendanceDayId,
        requesterAccountId: overtimeRequests.requestedByAccountId,
      })
      .from(overtimeRequests)
      .innerJoin(attendanceDays, eq(attendanceDays.id, overtimeRequests.attendanceDayId))
      .where(condition)
      .orderBy(asc(overtimeRequests.createdAt), asc(overtimeRequests.id))
      .limit(criteria.pageSize)
      .offset((criteria.page - 1) * criteria.pageSize);
    const [totals] = await this.database.db
      .select({ total: count() })
      .from(overtimeRequests)
      .innerJoin(attendanceDays, eq(attendanceDays.id, overtimeRequests.attendanceDayId))
      .where(condition);
    const approvedMinutesByDay = await this.findApprovedMinutesByDay(
      rows.map((row) => row.attendanceDayId),
    );
    const records = rows.map((row): StoredOvertimeReviewRequest => {
      const { attendanceDayId, requesterAccountId, ...storedRow } = row;
      return {
        ...toStoredOvertimeRequest(storedRow),
        requesterAccountId,
        approvedMinutes: approvedMinutesByDay.get(attendanceDayId) ?? 0,
      };
    });
    return { records, totalItems: totals?.total ?? 0 };
  }

  // Empty for an empty page, because an IN list needs at least one day.
  private async findApprovedMinutesByDay(
    attendanceDayIds: ReadonlyArray<string>,
  ): Promise<ReadonlyMap<string, number>> {
    const distinctDayIds = [...new Set(attendanceDayIds)];
    if (distinctDayIds.length === 0) return new Map();
    const rows = await this.database.db
      .select({
        attendanceDayId: overtimeRequests.attendanceDayId,
        minutes:
          sql<number>`sum(extract(epoch from (${overtimeRequests.requestedEndAt} - ${overtimeRequests.requestedStartAt}))) / 60`.mapWith(
            Number,
          ),
      })
      .from(overtimeRequests)
      .where(
        and(
          inArray(overtimeRequests.attendanceDayId, distinctDayIds),
          eq(overtimeRequests.status, 'APPROVED'),
        ),
      )
      .groupBy(overtimeRequests.attendanceDayId);
    return new Map(rows.map((row) => [row.attendanceDayId, row.minutes]));
  }
}

function buildReviewCondition(criteria: RequestReviewQueueCriteria): SQL | undefined {
  return and(
    eq(overtimeRequests.status, criteria.status),
    criteria.requesterAccountId === undefined
      ? undefined
      : eq(overtimeRequests.requestedByAccountId, criteria.requesterAccountId),
    criteria.from === undefined ? undefined : gte(attendanceDays.businessDate, criteria.from),
    criteria.to === undefined ? undefined : lte(attendanceDays.businessDate, criteria.to),
  );
}
