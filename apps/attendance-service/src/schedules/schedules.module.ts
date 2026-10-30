import { Module } from '@nestjs/common';
import { DefaultScheduleSeedService } from './default-schedule.seed.service.js';
import { WORK_SCHEDULE_REPOSITORY } from './work-schedule.repository.interface.js';
import { WorkScheduleRepository } from './work-schedule.repository.js';

@Module({
  providers: [
    { provide: WORK_SCHEDULE_REPOSITORY, useClass: WorkScheduleRepository },
    DefaultScheduleSeedService,
  ],
})
export class SchedulesModule {}
