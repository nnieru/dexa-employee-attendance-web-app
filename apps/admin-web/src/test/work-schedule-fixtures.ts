import type { WorkScheduleOverview, WorkScheduleVersion } from '@dexa/contracts';

export const WORK_SCHEDULES_URL = '/api/v1/work-schedules';
export const WORK_SCHEDULE_VERSION_URL = '/api/v1/work-schedules/:versionId';

// The version in effect. Open-ended while no upcoming version exists.
export const CURRENT_VERSION: WorkScheduleVersion = {
  id: '3c1f0a9e-5b2d-4c7e-8a1f-0d9e8c7b6a51',
  name: 'Company schedule',
  timezone: 'Asia/Jakarta',
  workingWeekdays: [1, 2, 3, 4, 5],
  startTime: '09:00',
  endTime: '18:00',
  lateCheckinGraceMinutes: 15,
  earlyCheckoutGraceMinutes: 0,
  lateCheckoutGraceMinutes: 0,
  effectiveFrom: '2026-10-01',
  effectiveUntil: null,
};

// The same version once an upcoming version exists: the service sets its end to the upcoming start (SCH-4).
export const CURRENT_VERSION_ENDING = {
  ...CURRENT_VERSION,
  effectiveUntil: '2026-12-01',
} satisfies WorkScheduleVersion;

// An upcoming version, as another change left it. Its start is 08:30, which the edit test changes.
export const UPCOMING_VERSION: WorkScheduleVersion = {
  id: 'b7d2e4f1-9a8c-4e3b-8d6f-2c1a0b9e8d7c',
  name: 'Company schedule',
  timezone: 'Asia/Jakarta',
  workingWeekdays: [1, 2, 3, 4, 5],
  startTime: '08:30',
  endTime: '18:00',
  lateCheckinGraceMinutes: 15,
  earlyCheckoutGraceMinutes: 0,
  lateCheckoutGraceMinutes: 0,
  effectiveFrom: '2026-12-01',
  effectiveUntil: null,
};

// What the service stores for a new version with Mon-Thu, 09:00 to 17:30.
export const CREATED_VERSION: WorkScheduleVersion = {
  id: 'e5a9c3d7-1f2b-4a6c-9e8d-7b0c1a2f3e4d',
  name: 'Company schedule',
  timezone: 'Asia/Jakarta',
  workingWeekdays: [1, 2, 3, 4],
  startTime: '09:00',
  endTime: '17:30',
  lateCheckinGraceMinutes: 15,
  earlyCheckoutGraceMinutes: 0,
  lateCheckoutGraceMinutes: 0,
  effectiveFrom: '2026-12-01',
  effectiveUntil: null,
};

export function buildWorkScheduleOverview(
  overview: Partial<WorkScheduleOverview>,
): WorkScheduleOverview {
  return { current: null, upcoming: null, ...overview };
}
