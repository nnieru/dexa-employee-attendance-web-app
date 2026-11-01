import { describe, expect, it } from 'vitest';
import type { WorkScheduleFormValues } from '../types/work-schedule-form.schema.js';
import { toWorkScheduleVersionRequest } from './to-work-schedule-version-request.js';

const FORM_VALUES: WorkScheduleFormValues = {
  workingWeekdays: ['5', '1', '3'],
  startTime: '08:30',
  endTime: '17:00',
  lateCheckinGraceMinutes: '10',
  earlyCheckoutGraceMinutes: '5',
  lateCheckoutGraceMinutes: '0',
  effectiveFrom: '2026-12-01',
};

describe('toWorkScheduleVersionRequest', () => {
  it('should send weekday numbers in ascending order, numeric grace values, and no timezone or end date', () => {
    expect(toWorkScheduleVersionRequest(FORM_VALUES)).toEqual({
      workingWeekdays: [1, 3, 5],
      startTime: '08:30',
      endTime: '17:00',
      lateCheckinGraceMinutes: 10,
      earlyCheckoutGraceMinutes: 5,
      lateCheckoutGraceMinutes: 0,
      effectiveFrom: '2026-12-01',
    });
  });
});
