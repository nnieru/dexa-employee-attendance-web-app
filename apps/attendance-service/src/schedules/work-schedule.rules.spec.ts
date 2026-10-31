import type { WorkScheduleVersion } from '@dexa/contracts';
import { selectWorkScheduleOverview } from './work-schedule.rules.js';

const PAST_VERSION: WorkScheduleVersion = {
  id: '3c1f0e2d-9a8b-4c7d-8e6f-5a4b3c2d1e0f',
  name: 'Past schedule',
  timezone: 'Asia/Jakarta',
  workingWeekdays: [1, 2, 3, 4, 5],
  startTime: '08:00',
  endTime: '17:00',
  lateCheckinGraceMinutes: 0,
  earlyCheckoutGraceMinutes: 0,
  lateCheckoutGraceMinutes: 0,
  effectiveFrom: '2026-01-01',
  effectiveUntil: '2026-11-02',
};

const CURRENT_VERSION: WorkScheduleVersion = {
  ...PAST_VERSION,
  id: '5f3c2a1e-7b4d-4c8e-9a6f-2d1b0e9c8a7f',
  name: 'Current schedule',
  startTime: '09:00',
  endTime: '18:00',
  lateCheckinGraceMinutes: 15,
  effectiveFrom: '2026-11-02',
  effectiveUntil: '2026-11-10',
};

const UPCOMING_VERSION: WorkScheduleVersion = {
  ...CURRENT_VERSION,
  id: '0b9e8d7c-6a5f-4e3d-8c2b-1a0f9e8d7c6b',
  name: 'Upcoming schedule',
  startTime: '08:30',
  effectiveFrom: '2026-11-10',
  effectiveUntil: null,
};

describe('selectWorkScheduleOverview', () => {
  it.each([
    {
      condition: 'today is the first day of the current version',
      businessDate: '2026-11-02',
      expectedCurrent: CURRENT_VERSION,
      expectedUpcoming: UPCOMING_VERSION,
    },
    {
      condition: 'today is the last day of the current version',
      businessDate: '2026-11-09',
      expectedCurrent: CURRENT_VERSION,
      expectedUpcoming: UPCOMING_VERSION,
    },
    {
      condition: 'today is the day the upcoming version takes effect',
      businessDate: '2026-11-10',
      expectedCurrent: UPCOMING_VERSION,
      expectedUpcoming: null,
    },
  ])(
    'should pick the version in effect and the upcoming version when $condition',
    ({ businessDate, expectedCurrent, expectedUpcoming }) => {
      const overview = selectWorkScheduleOverview(
        [CURRENT_VERSION, UPCOMING_VERSION],
        businessDate,
      );

      expect(overview).toEqual({ current: expectedCurrent, upcoming: expectedUpcoming });
    },
  );

  it('should report no upcoming version when only the version in effect exists', () => {
    const overview = selectWorkScheduleOverview([CURRENT_VERSION], '2026-11-03');

    expect(overview).toEqual({ current: CURRENT_VERSION, upcoming: null });
  });

  it('should report no version in effect when today is before the first version', () => {
    const overview = selectWorkScheduleOverview([UPCOMING_VERSION], '2026-11-03');

    expect(overview).toEqual({ current: null, upcoming: UPCOMING_VERSION });
  });

  it('should ignore a version that has already ended before today', () => {
    const overview = selectWorkScheduleOverview([PAST_VERSION], '2026-11-03');

    expect(overview).toEqual({ current: null, upcoming: null });
  });
});
