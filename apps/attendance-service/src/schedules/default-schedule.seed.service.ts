import { CLOCK, toBusinessDate, type IClock } from '@dexa/common';
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { CONFIG } from '../config/config.token.js';
import type { AttendanceServiceConfig } from '../config/attendance-service-config.schema.js';
import {
  WORK_SCHEDULE_REPOSITORY,
  type IWorkScheduleRepository,
} from './work-schedule.repository.interface.js';
import { createDefaultWorkSchedule } from './default-work-schedule.rules.js';

/**
 * Seeds the default company schedule on startup when no schedule exists (PRD SCH-2). Runs after the migrations, and
 * a restart finds the version and inserts nothing, so the seed is idempotent.
 */
@Injectable()
export class DefaultScheduleSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DefaultScheduleSeedService.name);

  constructor(
    @Inject(CONFIG) private readonly config: AttendanceServiceConfig,
    @Inject(CLOCK) private readonly clock: IClock,
    @Inject(WORK_SCHEDULE_REPOSITORY) private readonly schedules: IWorkScheduleRepository,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const effectiveFrom = toBusinessDate(this.clock.now(), this.config.BUSINESS_TIMEZONE);
    const schedule = createDefaultWorkSchedule({
      settings: this.config.ATTENDANCE_DEFAULT_SCHEDULE,
      timezone: this.config.BUSINESS_TIMEZONE,
      effectiveFrom,
    });
    const outcome = await this.schedules.insertIfNoSchedule(schedule);
    if (outcome === 'INSERTED') {
      this.logger.log('Seeded the default work schedule from the deployment configuration.');
      return;
    }
    this.logger.log('A work schedule already exists. The default schedule was not inserted.');
  }
}
