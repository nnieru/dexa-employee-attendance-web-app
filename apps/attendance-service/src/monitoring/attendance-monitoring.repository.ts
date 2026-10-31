import type { Database } from '@dexa/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, lte, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DATABASE } from '../infrastructure/db/database.token.js';
import { attendanceDays, masterAttendanceStatuses } from '../infrastructure/db/schema.js';
import type {
  AttendanceMonitoringCriteria,
  AttendanceMonitoringRecord,
  AttendanceMonitoringRecordPage,
  IAttendanceMonitoringReader,
} from './attendance-monitoring.repository.interface.js';

// A plain read with no FOR UPDATE. The date range and the date-then-account order are served by the
// (business_date, account_id) index; an employee filter is served by the unique (account_id, business_date) key
// (DATABASE §5.4).
@Injectable()
export class AttendanceMonitoringRepository implements IAttendanceMonitoringReader {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findDayPage(
    criteria: AttendanceMonitoringCriteria,
  ): Promise<AttendanceMonitoringRecordPage> {
    const checkinStatus = alias(masterAttendanceStatuses, 'checkin_status');
    const checkoutStatus = alias(masterAttendanceStatuses, 'checkout_status');
    const condition = buildCondition(criteria);
    const rows: AttendanceMonitoringRecord[] = await this.database.db
      .select({
        accountId: attendanceDays.accountId,
        businessDate: attendanceDays.businessDate,
        effectiveCheckinAt: attendanceDays.effectiveCheckinAt,
        checkinStatusCode: checkinStatus.code,
        effectiveCheckoutAt: attendanceDays.effectiveCheckoutAt,
        checkoutStatusCode: checkoutStatus.code,
      })
      .from(attendanceDays)
      .innerJoin(checkinStatus, eq(checkinStatus.id, attendanceDays.checkinStatusId))
      .innerJoin(checkoutStatus, eq(checkoutStatus.id, attendanceDays.checkoutStatusId))
      .where(condition)
      .orderBy(desc(attendanceDays.businessDate), asc(attendanceDays.accountId))
      .limit(criteria.pageSize)
      .offset((criteria.page - 1) * criteria.pageSize);
    const [totals] = await this.database.db
      .select({ total: count() })
      .from(attendanceDays)
      .where(condition);
    return { records: rows, totalItems: totals?.total ?? 0 };
  }
}

function buildCondition(criteria: AttendanceMonitoringCriteria): SQL | undefined {
  return and(
    criteria.accountId === undefined ? undefined : eq(attendanceDays.accountId, criteria.accountId),
    gte(attendanceDays.businessDate, criteria.from),
    lte(attendanceDays.businessDate, criteria.to),
  );
}
