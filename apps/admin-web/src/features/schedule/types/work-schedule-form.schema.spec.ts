import { describe, expect, it } from 'vitest';
import {
  EFFECTIVE_FROM_TOO_EARLY_MESSAGE,
  GRACE_MINUTES_MESSAGE,
  TIME_ORDER_MESSAGE,
  WORKING_DAY_REQUIRED_MESSAGE,
  createWorkScheduleFormSchema,
  type WorkScheduleFormValues,
} from './work-schedule-form.schema.js';

const EARLIEST_EFFECTIVE_FROM = '2026-11-16';

const VALID_VALUES: WorkScheduleFormValues = {
  workingWeekdays: ['1', '2', '3', '4', '5'],
  startTime: '09:00',
  endTime: '18:00',
  lateCheckinGraceMinutes: '15',
  earlyCheckoutGraceMinutes: '0',
  lateCheckoutGraceMinutes: '0',
  effectiveFrom: '2026-12-01',
};

function getIssues(values: WorkScheduleFormValues) {
  const result = createWorkScheduleFormSchema(EARLIEST_EFFECTIVE_FROM).safeParse(values);
  return result.success
    ? []
    : result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
}

describe('work schedule form rules', () => {
  it('should accept a complete version that takes effect tomorrow in WIB', () => {
    expect(getIssues({ ...VALID_VALUES, effectiveFrom: EARLIEST_EFFECTIVE_FROM })).toEqual([]);
  });

  it.each([
    ['today', '2026-11-15'],
    ['yesterday', '2026-11-14'],
  ])('should refuse an effective date that is %s', (_label, effectiveFrom) => {
    expect(getIssues({ ...VALID_VALUES, effectiveFrom })).toEqual([
      { path: 'effectiveFrom', message: EFFECTIVE_FROM_TOO_EARLY_MESSAGE },
    ]);
  });

  it('should refuse a version with no working day', () => {
    expect(getIssues({ ...VALID_VALUES, workingWeekdays: [] })).toEqual([
      { path: 'workingWeekdays', message: WORKING_DAY_REQUIRED_MESSAGE },
    ]);
  });

  it.each([
    ['equal to the start', '09:00'],
    ['before the start', '08:59'],
  ])('should refuse an end time %s', (_label, endTime) => {
    expect(getIssues({ ...VALID_VALUES, endTime })).toEqual([
      { path: 'endTime', message: TIME_ORDER_MESSAGE },
    ]);
  });

  it.each(['-1', '1.5', '', 'fifteen'])('should refuse the grace value "%s"', (value) => {
    expect(getIssues({ ...VALID_VALUES, lateCheckinGraceMinutes: value })).toEqual([
      { path: 'lateCheckinGraceMinutes', message: GRACE_MINUTES_MESSAGE },
    ]);
  });
});
