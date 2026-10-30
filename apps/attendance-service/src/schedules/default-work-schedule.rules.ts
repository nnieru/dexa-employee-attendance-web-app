import type { BusinessDate } from '@dexa/common';
import type { DefaultScheduleSettings } from '../config/default-schedule-setting.schema.js';
import type { NewWorkSchedule } from './work-schedule.repository.interface.js';

export const DEFAULT_WORK_SCHEDULE_NAME = 'Default company schedule';

/**
 * Builds the open-ended first version from the configured settings. The version starts on the business date of the
 * first startup and uses the business timezone, so the schedule and the day snapshots agree (DATABASE §5.2, §8).
 */
export function createDefaultWorkSchedule(input: {
  readonly settings: DefaultScheduleSettings;
  readonly timezone: string;
  readonly effectiveFrom: BusinessDate;
}): NewWorkSchedule {
  return {
    name: DEFAULT_WORK_SCHEDULE_NAME,
    timezone: input.timezone,
    workingWeekdays: input.settings.workingWeekdays,
    startTime: input.settings.startTime,
    endTime: input.settings.endTime,
    lateCheckinGraceMinutes: input.settings.lateCheckinGraceMinutes,
    earlyCheckoutGraceMinutes: input.settings.earlyCheckoutGraceMinutes,
    lateCheckoutGraceMinutes: input.settings.lateCheckoutGraceMinutes,
    effectiveFrom: input.effectiveFrom,
  };
}
