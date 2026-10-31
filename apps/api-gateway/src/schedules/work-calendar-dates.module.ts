import { Module } from '@nestjs/common';
import { WORK_CALENDAR_DATE_CLIENT } from './work-calendar-date-client.interface.js';
import { WorkCalendarDateClient } from './work-calendar-date.client.js';
import { WorkCalendarDateController } from './work-calendar-date.controller.js';

@Module({
  controllers: [WorkCalendarDateController],
  providers: [{ provide: WORK_CALENDAR_DATE_CLIENT, useClass: WorkCalendarDateClient }],
})
export class GatewayWorkCalendarDatesModule {}
