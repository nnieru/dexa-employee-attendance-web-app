import { Module } from '@nestjs/common';
import { WORK_SCHEDULE_CLIENT } from './work-schedule-client.interface.js';
import { WorkScheduleClient } from './work-schedule.client.js';
import { WorkScheduleController } from './work-schedule.controller.js';

@Module({
  controllers: [WorkScheduleController],
  providers: [{ provide: WORK_SCHEDULE_CLIENT, useClass: WorkScheduleClient }],
})
export class GatewayWorkSchedulesModule {}
