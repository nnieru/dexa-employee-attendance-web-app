import type { Database } from '@dexa/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, type SQL } from 'drizzle-orm';
import { DATABASE } from '../infrastructure/db/database.token.js';
import { attendanceDays, overtimeRequests } from '../infrastructure/db/schema.js';
import {
  storedOvertimeRequestColumns,
  toStoredOvertimeRequest,
} from './overtime-request.repository.js';
import type {
  IOvertimeRequestListReader,
  OwnOvertimeRequestCriteria,
  StoredOvertimeRequestPage,
} from './overtime-request-list.repository.interface.js';

// A plain read with no row lock. The account predicate is served by the leading column of the unique
// (requested_by_account_id, idempotency_key) key, so no extra index is needed for this list.
@Injectable()
export class OvertimeRequestListRepository implements IOvertimeRequestListReader {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findOwnRequestPage(
    criteria: OwnOvertimeRequestCriteria,
  ): Promise<StoredOvertimeRequestPage> {
    const condition = buildOwnRequestCondition(criteria);
    const rows = await this.database.db
      .select(storedOvertimeRequestColumns)
      .from(overtimeRequests)
      .innerJoin(attendanceDays, eq(attendanceDays.id, overtimeRequests.attendanceDayId))
      .where(condition)
      .orderBy(desc(overtimeRequests.createdAt), desc(overtimeRequests.id))
      .limit(criteria.pageSize)
      .offset((criteria.page - 1) * criteria.pageSize);
    const [totals] = await this.database.db
      .select({ total: count() })
      .from(overtimeRequests)
      .where(condition);
    return { records: rows.map(toStoredOvertimeRequest), totalItems: totals?.total ?? 0 };
  }
}

function buildOwnRequestCondition(criteria: OwnOvertimeRequestCriteria): SQL | undefined {
  return and(
    eq(overtimeRequests.requestedByAccountId, criteria.accountId),
    criteria.status === undefined ? undefined : eq(overtimeRequests.status, criteria.status),
  );
}
