import { workScheduleVersionRequestSchema, type WorkScheduleVersionRequest } from '@dexa/contracts';
import type { WorkScheduleFormValues } from '../types/work-schedule-form.schema.js';
import { toWorkingWeekdayNumbers } from './work-schedule-weekdays.js';

/**
 * Builds the request from valid form values and parses it with the shared contract. The form rules already match the
 * contract, so a parse failure here means the two drifted apart: it throws instead of sending a guess. The request has
 * no timezone (the service uses the configured business timezone) and no effectiveUntil (the service sets it).
 */
export function toWorkScheduleVersionRequest(
  values: WorkScheduleFormValues,
): WorkScheduleVersionRequest {
  return workScheduleVersionRequestSchema.parse({
    workingWeekdays: toWorkingWeekdayNumbers(values.workingWeekdays),
    startTime: values.startTime,
    endTime: values.endTime,
    lateCheckinGraceMinutes: Number(values.lateCheckinGraceMinutes),
    earlyCheckoutGraceMinutes: Number(values.earlyCheckoutGraceMinutes),
    lateCheckoutGraceMinutes: Number(values.lateCheckoutGraceMinutes),
    effectiveFrom: values.effectiveFrom,
  });
}
