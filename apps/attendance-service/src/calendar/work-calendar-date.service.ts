import type { WorkCalendarDatePage, WorkCalendarDateListQuery } from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import {
  WORK_CALENDAR_DATE_READER,
  type IWorkCalendarDateReader,
} from './work-calendar-date.repository.interface.js';
import { buildWorkCalendarDatePage } from './work-calendar-date.rules.js';
import type { IWorkCalendarDateService } from './work-calendar-date.service.interface.js';

@Injectable()
export class WorkCalendarDateService implements IWorkCalendarDateService {
  constructor(@Inject(WORK_CALENDAR_DATE_READER) private readonly dates: IWorkCalendarDateReader) {}

  async listDates(query: WorkCalendarDateListQuery): Promise<WorkCalendarDatePage> {
    const recordPage = await this.dates.findDatePage({
      from: query.from,
      to: query.to,
      page: query.page,
      pageSize: query.pageSize,
    });
    return buildWorkCalendarDatePage(recordPage, query);
  }
}
