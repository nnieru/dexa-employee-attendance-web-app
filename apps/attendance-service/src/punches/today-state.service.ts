import { CLOCK, toBusinessDate, type BusinessDate, type IClock } from '@dexa/common';
import type { TodayAttendanceResponse } from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { CONFIG } from '../config/config.token.js';
import type { AttendanceServiceConfig } from '../config/attendance-service-config.schema.js';
import { resolveDaySchedule } from '../classification/punch-classification.rules.js';
import { buildTodayAttendance } from './today-state.rules.js';
import type { ITodayStateService } from './today-state.service.interface.js';
import { TodayScheduleNotConfiguredError } from './punch.errors.js';
import {
  TODAY_STATE_READER,
  type ITodayStateReader,
  type TodayScheduleFields,
} from './today-state.repository.interface.js';
import type { ScheduleVersion } from './punch.repository.interface.js';

@Injectable()
export class TodayStateService implements ITodayStateService {
  constructor(
    @Inject(TODAY_STATE_READER) private readonly reader: ITodayStateReader,
    @Inject(CLOCK) private readonly clock: IClock,
    @Inject(CONFIG) private readonly config: Pick<AttendanceServiceConfig, 'BUSINESS_TIMEZONE'>,
  ) {}

  // The instant is read once, so the business date is the one the state is derived for. The schedule check runs
  // first, so a day with no schedule version answers the same error as a punch.
  async getToday(accountId: string): Promise<TodayAttendanceResponse> {
    const businessDate = toBusinessDate(this.clock.now(), this.config.BUSINESS_TIMEZONE);
    const scheduleVersion = await this.reader.findScheduleInEffect(businessDate);
    if (scheduleVersion === undefined) throw new TodayScheduleNotConfiguredError();

    const day = await this.reader.findDay(accountId, businessDate);
    const schedule =
      day === undefined
        ? await this.scheduleBeforeFirstPunch(businessDate, scheduleVersion)
        : day.schedule;
    return buildTodayAttendance({ businessDate, schedule, day });
  }

  // Before the first punch the day has no snapshot, so the schedule is resolved the same way a first punch resolves it.
  private async scheduleBeforeFirstPunch(
    businessDate: BusinessDate,
    scheduleVersion: ScheduleVersion,
  ): Promise<TodayScheduleFields> {
    const calendarException = await this.reader.findCalendarException(businessDate);
    return resolveDaySchedule({ businessDate, scheduleVersion, calendarException });
  }
}
