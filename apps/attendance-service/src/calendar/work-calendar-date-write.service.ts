import { CLOCK, toBusinessDate, type BusinessDate, type IClock } from '@dexa/common';
import type { WorkCalendarDate, WorkCalendarDateRequest } from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { CONFIG } from '../config/config.token.js';
import type { AttendanceServiceConfig } from '../config/attendance-service-config.schema.js';
import {
  WorkCalendarDateNotFoundError,
  WorkCalendarDateNotFutureError,
} from './work-calendar-date.errors.js';
import {
  WORK_CALENDAR_DATE_WRITER,
  type IWorkCalendarDateWriter,
} from './work-calendar-date.repository.interface.js';
import { buildWorkCalendarDateValues, isCalendarDateEditable } from './work-calendar-date.rules.js';
import type { IWorkCalendarDateWriteService } from './work-calendar-date-write.service.interface.js';

@Injectable()
export class WorkCalendarDateWriteService implements IWorkCalendarDateWriteService {
  constructor(
    @Inject(WORK_CALENDAR_DATE_WRITER) private readonly writer: IWorkCalendarDateWriter,
    @Inject(CLOCK) private readonly clock: IClock,
    @Inject(CONFIG) private readonly config: Pick<AttendanceServiceConfig, 'BUSINESS_TIMEZONE'>,
  ) {}

  async upsertDate(
    date: BusinessDate,
    request: WorkCalendarDateRequest,
  ): Promise<WorkCalendarDate> {
    this.assertEditable(date);
    return this.writer.upsertDate(buildWorkCalendarDateValues(date, request));
  }

  // The editable check runs first, so a past date answers 409 whether or not it has an exception.
  async deleteDate(date: BusinessDate): Promise<void> {
    this.assertEditable(date);
    const isDeleted = await this.writer.deleteDate(date);
    if (!isDeleted) throw new WorkCalendarDateNotFoundError();
  }

  private assertEditable(date: BusinessDate): void {
    const businessDate = toBusinessDate(this.clock.now(), this.config.BUSINESS_TIMEZONE);
    if (!isCalendarDateEditable(date, businessDate)) throw new WorkCalendarDateNotFutureError();
  }
}
