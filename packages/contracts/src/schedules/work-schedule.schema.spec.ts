import { workScheduleOverviewSchema, workScheduleVersionSchema } from './work-schedule.schema.js';

const CURRENT_VERSION = {
  id: '5f3c2a1e-7b4d-4c8e-9a6f-2d1b0e9c8a7f',
  name: 'Default company schedule',
  timezone: 'Asia/Jakarta',
  workingWeekdays: [1, 2, 3, 4, 5],
  startTime: '09:00',
  endTime: '18:00',
  lateCheckinGraceMinutes: 15,
  earlyCheckoutGraceMinutes: 0,
  lateCheckoutGraceMinutes: 0,
  effectiveFrom: '2026-11-02',
  effectiveUntil: '2026-11-10',
};

const UPCOMING_VERSION = {
  ...CURRENT_VERSION,
  id: '0b9e8d7c-6a5f-4e3d-8c2b-1a0f9e8d7c6b',
  startTime: '08:30',
  effectiveFrom: '2026-11-10',
  effectiveUntil: null,
};

describe('workScheduleVersionSchema', () => {
  it('should accept a version with every schedule field', () => {
    expect(workScheduleVersionSchema.parse(CURRENT_VERSION)).toEqual(CURRENT_VERSION);
  });

  it.each([
    { condition: 'the start time has seconds', field: { startTime: '09:00:00' } },
    { condition: 'the end hour is out of range', field: { endTime: '24:00' } },
    { condition: 'a grace value is negative', field: { lateCheckinGraceMinutes: -1 } },
    { condition: 'a weekday is outside 1 to 7', field: { workingWeekdays: [0, 1] } },
    { condition: 'no weekday is working', field: { workingWeekdays: [] } },
    {
      condition: 'the effective date has a time part',
      field: { effectiveFrom: '2026-11-10T00:00' },
    },
  ])('should reject the version when $condition', ({ field }) => {
    expect(workScheduleVersionSchema.safeParse({ ...CURRENT_VERSION, ...field }).success).toBe(
      false,
    );
  });
});

describe('workScheduleOverviewSchema', () => {
  it('should accept the version in effect with an upcoming version', () => {
    expect(
      workScheduleOverviewSchema.parse({ current: CURRENT_VERSION, upcoming: UPCOMING_VERSION }),
    ).toEqual({ current: CURRENT_VERSION, upcoming: UPCOMING_VERSION });
  });

  it('should accept the version in effect with no upcoming version', () => {
    expect(
      workScheduleOverviewSchema.parse({
        current: { ...CURRENT_VERSION, effectiveUntil: null },
        upcoming: null,
      }),
    ).toMatchObject({ upcoming: null });
  });

  it('should reject the overview when a field is missing', () => {
    expect(workScheduleOverviewSchema.safeParse({ current: CURRENT_VERSION }).success).toBe(false);
  });
});
