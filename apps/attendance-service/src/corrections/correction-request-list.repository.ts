import type { Database } from '@dexa/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, type SQL } from 'drizzle-orm';
import { DATABASE } from '../infrastructure/db/database.token.js';
import { attendanceAdjustmentRequests, attendanceDays } from '../infrastructure/db/schema.js';
import {
  requestedStatuses,
  storedCorrectionRequestColumns,
  toStoredCorrectionRequest,
} from './correction-request.repository.js';
import type {
  ICorrectionRequestListReader,
  OwnCorrectionRequestCriteria,
  StoredCorrectionRequestPage,
} from './correction-request-list.repository.interface.js';

// A plain read with no row lock. The account predicate is served by the leading column of the unique
// (requested_by_account_id, idempotency_key) key, so no extra index is needed for this list (DATABASE §5.8).
@Injectable()
export class CorrectionRequestListRepository implements ICorrectionRequestListReader {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findOwnRequestPage(
    criteria: OwnCorrectionRequestCriteria,
  ): Promise<StoredCorrectionRequestPage> {
    const condition = buildOwnRequestCondition(criteria);
    const rows = await this.database.db
      .select(storedCorrectionRequestColumns)
      .from(attendanceAdjustmentRequests)
      .innerJoin(
        attendanceDays,
        eq(attendanceDays.id, attendanceAdjustmentRequests.attendanceDayId),
      )
      .innerJoin(
        requestedStatuses,
        eq(requestedStatuses.id, attendanceAdjustmentRequests.requestedDayStatusId),
      )
      .where(condition)
      .orderBy(desc(attendanceAdjustmentRequests.createdAt), desc(attendanceAdjustmentRequests.id))
      .limit(criteria.pageSize)
      .offset((criteria.page - 1) * criteria.pageSize);
    const [totals] = await this.database.db
      .select({ total: count() })
      .from(attendanceAdjustmentRequests)
      .where(condition);
    return { records: rows.map(toStoredCorrectionRequest), totalItems: totals?.total ?? 0 };
  }
}

function buildOwnRequestCondition(criteria: OwnCorrectionRequestCriteria): SQL | undefined {
  return and(
    eq(attendanceAdjustmentRequests.requestedByAccountId, criteria.accountId),
    criteria.status === undefined
      ? undefined
      : eq(attendanceAdjustmentRequests.status, criteria.status),
  );
}
