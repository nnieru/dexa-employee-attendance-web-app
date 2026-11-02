import type { WorkScheduleVersion } from '@dexa/contracts';
import type { WorkScheduleFormValues } from '../types/work-schedule-form.schema.js';
import { toWorkingWeekdayValues } from './work-schedule-weekdays.js';

/**
 * The starting values of a new version. A new version copies the working rules of the version in effect, so HR changes
 * only what differs. Its effective date stays empty: HR picks the date on purpose.
 */
export function toCreateWorkScheduleFormValues(
  current: WorkScheduleVersion | null,
): WorkScheduleFormValues {
  if (current === null) return toBlankRules('');
  return { ...toRules(current), effectiveFrom: '' };
}

/** The starting values of an edit. The upcoming version is the baseline, including its effective date. */
export function toEditWorkScheduleFormValues(
  upcoming: WorkScheduleVersion,
): WorkScheduleFormValues {
  return { ...toRules(upcoming), effectiveFrom: upcoming.effectiveFrom };
}

function toRules(version: WorkScheduleVersion): Omit<WorkScheduleFormValues, 'effectiveFrom'> {
  return {
    workingWeekdays: toWorkingWeekdayValues(version.workingWeekdays),
    startTime: version.startTime,
    endTime: version.endTime,
    lateCheckinGraceMinutes: String(version.lateCheckinGraceMinutes),
    earlyCheckoutGraceMinutes: String(version.earlyCheckoutGraceMinutes),
    lateCheckoutGraceMinutes: String(version.lateCheckoutGraceMinutes),
  };
}

// With no version to copy, every field starts empty. The seeded default lives in deployment configuration, which the
// browser does not read, so the screen does not guess it.
function toBlankRules(effectiveFrom: string): WorkScheduleFormValues {
  return {
    workingWeekdays: [],
    startTime: '',
    endTime: '',
    lateCheckinGraceMinutes: '',
    earlyCheckoutGraceMinutes: '',
    lateCheckoutGraceMinutes: '',
    effectiveFrom,
  };
}
