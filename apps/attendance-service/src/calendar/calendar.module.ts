import { Module } from '@nestjs/common';
import {
  WORK_CALENDAR_DATE_READER,
  WORK_CALENDAR_DATE_WRITER,
} from './work-calendar-date.repository.interface.js';
import { WorkCalendarDateRepository } from './work-calendar-date.repository.js';
import { WorkCalendarDateController } from './work-calendar-date.controller.js';
import { WORK_CALENDAR_DATE_SERVICE } from './work-calendar-date.service.interface.js';
import { WorkCalendarDateService } from './work-calendar-date.service.js';
import { WORK_CALENDAR_DATE_WRITE_SERVICE } from './work-calendar-date-write.service.interface.js';
import { WorkCalendarDateWriteService } from './work-calendar-date-write.service.js';

@Module({
  controllers: [WorkCalendarDateController],
  providers: [
    { provide: WORK_CALENDAR_DATE_READER, useClass: WorkCalendarDateRepository },
    { provide: WORK_CALENDAR_DATE_WRITER, useExisting: WORK_CALENDAR_DATE_READER },
    { provide: WORK_CALENDAR_DATE_SERVICE, useClass: WorkCalendarDateService },
    { provide: WORK_CALENDAR_DATE_WRITE_SERVICE, useClass: WorkCalendarDateWriteService },
  ],
})
export class CalendarModule {}
