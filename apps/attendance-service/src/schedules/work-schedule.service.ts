import { CLOCK, toBusinessDate, type IClock } from '@dexa/common';
import type { WorkScheduleOverview } from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { CONFIG } from '../config/config.token.js';
import type { AttendanceServiceConfig } from '../config/attendance-service-config.schema.js';
import {
  WORK_SCHEDULE_VERSION_READER,
  type IWorkScheduleVersionReader,
} from './work-schedule.repository.interface.js';
import { selectWorkScheduleOverview } from './work-schedule.rules.js';
import type { IWorkScheduleService } from './work-schedule.service.interface.js';

@Injectable()
export class WorkScheduleService implements IWorkScheduleService {
  constructor(
    @Inject(WORK_SCHEDULE_VERSION_READER) private readonly versions: IWorkScheduleVersionReader,
    @Inject(CLOCK) private readonly clock: IClock,
    @Inject(CONFIG) private readonly config: Pick<AttendanceServiceConfig, 'BUSINESS_TIMEZONE'>,
  ) {}

  async getScheduleOverview(): Promise<WorkScheduleOverview> {
    const businessDate = toBusinessDate(this.clock.now(), this.config.BUSINESS_TIMEZONE);
    const versions = await this.versions.findInEffectOrUpcoming(businessDate);
    return selectWorkScheduleOverview(versions, businessDate);
  }
}
