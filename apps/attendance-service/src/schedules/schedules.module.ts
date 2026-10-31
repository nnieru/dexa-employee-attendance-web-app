import { Module } from '@nestjs/common';
import { DefaultScheduleSeedService } from './default-schedule.seed.service.js';
import {
  WORK_SCHEDULE_REPOSITORY,
  WORK_SCHEDULE_VERSION_READER,
  WORK_SCHEDULE_VERSION_WRITER,
} from './work-schedule.repository.interface.js';
import { WorkScheduleRepository } from './work-schedule.repository.js';
import { WorkScheduleController } from './work-schedule.controller.js';
import { WORK_SCHEDULE_SERVICE } from './work-schedule.service.interface.js';
import { WorkScheduleService } from './work-schedule.service.js';
import { WORK_SCHEDULE_VERSION_SERVICE } from './work-schedule-version.service.interface.js';
import { WorkScheduleVersionService } from './work-schedule-version.service.js';

@Module({
  controllers: [WorkScheduleController],
  providers: [
    { provide: WORK_SCHEDULE_REPOSITORY, useClass: WorkScheduleRepository },
    { provide: WORK_SCHEDULE_VERSION_READER, useExisting: WORK_SCHEDULE_REPOSITORY },
    { provide: WORK_SCHEDULE_VERSION_WRITER, useExisting: WORK_SCHEDULE_REPOSITORY },
    { provide: WORK_SCHEDULE_SERVICE, useClass: WorkScheduleService },
    { provide: WORK_SCHEDULE_VERSION_SERVICE, useClass: WorkScheduleVersionService },
    DefaultScheduleSeedService,
  ],
})
export class SchedulesModule {}
