import {
  createDefaultWorkSchedule,
  DEFAULT_WORK_SCHEDULE_NAME,
} from './default-work-schedule.rules.js';

describe('createDefaultWorkSchedule', () => {
  it('should copy the configured settings into an open-ended version in the business timezone', () => {
    const schedule = createDefaultWorkSchedule({
      settings: {
        workingWeekdays: [1, 3, 5],
        startTime: '08:30',
        endTime: '17:00',
        lateCheckinGraceMinutes: 10,
        earlyCheckoutGraceMinutes: 5,
        lateCheckoutGraceMinutes: 20,
      },
      timezone: 'Asia/Jakarta',
      effectiveFrom: '2026-10-31',
    });

    expect(schedule).toEqual({
      name: DEFAULT_WORK_SCHEDULE_NAME,
      timezone: 'Asia/Jakarta',
      workingWeekdays: [1, 3, 5],
      startTime: '08:30',
      endTime: '17:00',
      lateCheckinGraceMinutes: 10,
      earlyCheckoutGraceMinutes: 5,
      lateCheckoutGraceMinutes: 20,
      effectiveFrom: '2026-10-31',
    });
  });
});
