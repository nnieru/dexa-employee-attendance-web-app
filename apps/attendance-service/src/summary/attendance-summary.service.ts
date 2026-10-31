import { CLOCK, getMonthStart, toBusinessDate, ValidationError, type IClock } from '@dexa/common';
import {
  ErrorCode,
  isSummaryRangeOrdered,
  type AttendanceSummaryPage,
  type AttendanceSummaryQuery,
} from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { CONFIG } from '../config/config.token.js';
import type { AttendanceServiceConfig } from '../config/attendance-service-config.schema.js';
import {
  ATTENDANCE_SUMMARY_READER,
  type IAttendanceSummaryReader,
} from './attendance-summary.repository.interface.js';
import type { IAttendanceSummaryService } from './attendance-summary.service.interface.js';
import { toAttendanceSummaryItem, toAttendanceSummaryPage } from './attendance-summary.rules.js';

@Injectable()
export class AttendanceSummaryService implements IAttendanceSummaryService {
  constructor(
    @Inject(ATTENDANCE_SUMMARY_READER) private readonly reader: IAttendanceSummaryReader,
    @Inject(CLOCK) private readonly clock: IClock,
    @Inject(CONFIG) private readonly config: Pick<AttendanceServiceConfig, 'BUSINESS_TIMEZONE'>,
  ) {}

  // The defaults are filled here, not in the schema, because they depend on the clock (PRD SUM-1). The range is
  // checked again after filling, because a single bound given by the client can fall out of order with its default.
  async listOwnSummary(
    accountId: string,
    query: AttendanceSummaryQuery,
  ): Promise<AttendanceSummaryPage> {
    const today = toBusinessDate(this.clock.now(), this.config.BUSINESS_TIMEZONE);
    const from = query.from ?? getMonthStart(today);
    const to = query.to ?? today;
    if (!isSummaryRangeOrdered(from, to)) {
      throw new ValidationError(ErrorCode.VALIDATION_FAILED, 'from: must not be after to');
    }
    const { records, totalItems } = await this.reader.findDayPage({
      accountId,
      from,
      to,
      page: query.page,
      pageSize: query.pageSize,
    });
    return toAttendanceSummaryPage(records.map(toAttendanceSummaryItem), query, totalItems);
  }
}
