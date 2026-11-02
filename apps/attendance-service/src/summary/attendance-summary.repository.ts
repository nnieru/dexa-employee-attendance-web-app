import type { Database } from '@dexa/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte, lte, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { approvedOvertimeMinutesOfDay } from '../overtime/approved-overtime-minutes.query.js';
import { DATABASE } from '../infrastructure/db/database.token.js';
import { attendanceDays, masterAttendanceStatuses } from '../infrastructure/db/schema.js';
import type {
  AttendanceSummaryCriteria,
  AttendanceSummaryRecord,
  AttendanceSummaryRecordPage,
  IAttendanceSummaryReader,
} from './attendance-summary.repository.interface.js';

// A plain read with no FOR UPDATE, so a summary never waits on a punch in progress. The account and the date range
// are one predicate on attendance_days, served by its unique (account_id, business_date) key, and the newest-first
// order follows that key too.
@Injectable()
export class AttendanceSummaryRepository implements IAttendanceSummaryReader {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findDayPage(criteria: AttendanceSummaryCriteria): Promise<AttendanceSummaryRecordPage> {
    const dayStatus = alias(masterAttendanceStatuses, 'day_status');
    const checkinStatus = alias(masterAttendanceStatuses, 'checkin_status');
    const checkoutStatus = alias(masterAttendanceStatuses, 'checkout_status');
    const condition = buildRangeCondition(criteria);
    // No presence predicate: a day that a request or a sick, leave, or day-off correction created is a row too.
    const rows: AttendanceSummaryRecord[] = await this.database.db
      .select({
        businessDate: attendanceDays.businessDate,
        dayStatusCode: dayStatus.code,
        effectiveCheckinAt: attendanceDays.effectiveCheckinAt,
        checkinStatusCode: checkinStatus.code,
        effectiveCheckoutAt: attendanceDays.effectiveCheckoutAt,
        checkoutStatusCode: checkoutStatus.code,
        approvedOvertimeMinutes: approvedOvertimeMinutesOfDay(),
      })
      .from(attendanceDays)
      .innerJoin(dayStatus, eq(dayStatus.id, attendanceDays.dayStatusId))
      .innerJoin(checkinStatus, eq(checkinStatus.id, attendanceDays.checkinStatusId))
      .innerJoin(checkoutStatus, eq(checkoutStatus.id, attendanceDays.checkoutStatusId))
      .where(condition)
      .orderBy(desc(attendanceDays.businessDate))
      .limit(criteria.pageSize)
      .offset((criteria.page - 1) * criteria.pageSize);
    const [totals] = await this.database.db
      .select({ total: count() })
      .from(attendanceDays)
      .where(condition);
    return { records: rows, totalItems: totals?.total ?? 0 };
  }
}

function buildRangeCondition(criteria: AttendanceSummaryCriteria): SQL | undefined {
  return and(
    eq(attendanceDays.accountId, criteria.accountId),
    gte(attendanceDays.businessDate, criteria.from),
    lte(attendanceDays.businessDate, criteria.to),
  );
}
