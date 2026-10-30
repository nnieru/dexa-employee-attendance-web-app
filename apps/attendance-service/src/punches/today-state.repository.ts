import type { BusinessDate } from '@dexa/common';
import type { Database } from '@dexa/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DATABASE } from '../infrastructure/db/database.token.js';
import { attendanceDays, masterAttendanceStatuses } from '../infrastructure/db/schema.js';
import { findCalendarException, findScheduleInEffect } from './punch.repository.js';
import type {
  ITodayStateReader,
  TodayDayRecord,
  TodayScheduleFields,
} from './today-state.repository.interface.js';

// A plain read with no FOR UPDATE, so a state check never waits on a punch in progress.
@Injectable()
export class TodayStateRepository implements ITodayStateReader {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  findScheduleInEffect(businessDate: BusinessDate) {
    return findScheduleInEffect(this.database.db, businessDate);
  }

  findCalendarException(businessDate: BusinessDate) {
    return findCalendarException(this.database.db, businessDate);
  }

  async findDay(
    accountId: string,
    businessDate: BusinessDate,
  ): Promise<TodayDayRecord | undefined> {
    const checkinStatus = alias(masterAttendanceStatuses, 'checkin_status');
    const checkoutStatus = alias(masterAttendanceStatuses, 'checkout_status');
    const [row] = await this.database.db
      .select({
        isWorkingDay: attendanceDays.isWorkingDay,
        scheduledStartAt: attendanceDays.scheduledStartAt,
        scheduledEndAt: attendanceDays.scheduledEndAt,
        effectiveCheckinAt: attendanceDays.effectiveCheckinAt,
        effectiveCheckoutAt: attendanceDays.effectiveCheckoutAt,
        checkinStatusCode: checkinStatus.code,
        checkoutStatusCode: checkoutStatus.code,
      })
      .from(attendanceDays)
      .innerJoin(checkinStatus, eq(checkinStatus.id, attendanceDays.checkinStatusId))
      .innerJoin(checkoutStatus, eq(checkoutStatus.id, attendanceDays.checkoutStatusId))
      .where(
        and(eq(attendanceDays.accountId, accountId), eq(attendanceDays.businessDate, businessDate)),
      )
      .limit(1);
    if (row === undefined) return undefined;
    return {
      schedule: toTodaySchedule(row),
      effectiveCheckinAt: row.effectiveCheckinAt,
      checkinStatusCode: row.checkinStatusCode,
      effectiveCheckoutAt: row.effectiveCheckoutAt,
      checkoutStatusCode: row.checkoutStatusCode,
    };
  }
}

// The database checks make a working day always carry both scheduled instants (attendance_days_working_day_schedule_ck),
// so a missing instant is a broken row.
function toTodaySchedule(row: {
  readonly isWorkingDay: boolean;
  readonly scheduledStartAt: Date | null;
  readonly scheduledEndAt: Date | null;
}): TodayScheduleFields {
  if (!row.isWorkingDay) {
    return { isWorkingDay: false, scheduledStartAt: null, scheduledEndAt: null };
  }
  if (row.scheduledStartAt === null || row.scheduledEndAt === null) {
    throw new Error('A working day has no scheduled start or end.');
  }
  return {
    isWorkingDay: true,
    scheduledStartAt: row.scheduledStartAt,
    scheduledEndAt: row.scheduledEndAt,
  };
}
