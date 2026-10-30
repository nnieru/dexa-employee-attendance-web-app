import {
  classifyCheckIn,
  classifyCheckOut,
  resolveDaySchedule,
  type ScheduleVersionInput,
} from './punch-classification.rules.js';

const DEFAULT_SCHEDULE_VERSION: ScheduleVersionInput = {
  timezone: 'Asia/Jakarta',
  workingWeekdays: [1, 2, 3, 4, 5],
  startTime: '09:00',
  endTime: '18:00',
  lateCheckinGraceMinutes: 15,
  earlyCheckoutGraceMinutes: 0,
  lateCheckoutGraceMinutes: 0,
};

// Friday 2026-10-30 is a regular working day; Saturday 2026-10-31 is a regular day off.
const REGULAR_FRIDAY = resolveDaySchedule({
  businessDate: '2026-10-30',
  scheduleVersion: DEFAULT_SCHEDULE_VERSION,
  calendarException: null,
});
const HOLIDAY_FRIDAY = resolveDaySchedule({
  businessDate: '2026-10-30',
  scheduleVersion: DEFAULT_SCHEDULE_VERSION,
  calendarException: { isWorkingDay: false },
});
const SPECIAL_WORKING_SATURDAY = resolveDaySchedule({
  businessDate: '2026-10-31',
  scheduleVersion: DEFAULT_SCHEDULE_VERSION,
  calendarException: { isWorkingDay: true },
});
const REGULAR_SATURDAY = resolveDaySchedule({
  businessDate: '2026-10-31',
  scheduleVersion: DEFAULT_SCHEDULE_VERSION,
  calendarException: null,
});

describe('resolveDaySchedule', () => {
  it.each([
    {
      condition: 'the date is a regular weekday with no calendar exception',
      businessDate: '2026-10-30',
      scheduleVersion: DEFAULT_SCHEDULE_VERSION,
      calendarException: null,
      expected: {
        isWorkingDay: true,
        timezone: 'Asia/Jakarta',
        scheduledStartAt: new Date('2026-10-30T02:00:00Z'),
        scheduledEndAt: new Date('2026-10-30T11:00:00Z'),
        lateCheckinGraceMinutes: 15,
        earlyCheckoutGraceMinutes: 0,
        lateCheckoutGraceMinutes: 0,
      },
    },
    {
      condition: 'the date is a Saturday with no calendar exception',
      businessDate: '2026-10-31',
      scheduleVersion: DEFAULT_SCHEDULE_VERSION,
      calendarException: null,
      expected: {
        isWorkingDay: false,
        timezone: 'Asia/Jakarta',
        scheduledStartAt: null,
        scheduledEndAt: null,
      },
    },
    {
      condition: 'a weekday has a holiday exception',
      businessDate: '2026-10-30',
      scheduleVersion: DEFAULT_SCHEDULE_VERSION,
      calendarException: { isWorkingDay: false },
      expected: {
        isWorkingDay: false,
        timezone: 'Asia/Jakarta',
        scheduledStartAt: null,
        scheduledEndAt: null,
      },
    },
    {
      condition: 'a Saturday has a special working-day exception',
      businessDate: '2026-10-31',
      scheduleVersion: DEFAULT_SCHEDULE_VERSION,
      calendarException: { isWorkingDay: true },
      expected: {
        isWorkingDay: true,
        timezone: 'Asia/Jakarta',
        scheduledStartAt: new Date('2026-10-31T02:00:00Z'),
        scheduledEndAt: new Date('2026-10-31T11:00:00Z'),
        lateCheckinGraceMinutes: 15,
        earlyCheckoutGraceMinutes: 0,
        lateCheckoutGraceMinutes: 0,
      },
    },
    {
      condition: 'the weekday is not in the schedule working weekdays',
      businessDate: '2026-10-27',
      scheduleVersion: { ...DEFAULT_SCHEDULE_VERSION, workingWeekdays: [1, 3, 5] },
      calendarException: null,
      expected: {
        isWorkingDay: false,
        timezone: 'Asia/Jakarta',
        scheduledStartAt: null,
        scheduledEndAt: null,
      },
    },
    {
      condition: 'the schedule timezone is UTC',
      businessDate: '2026-10-30',
      scheduleVersion: { ...DEFAULT_SCHEDULE_VERSION, timezone: 'UTC' },
      calendarException: null,
      expected: {
        isWorkingDay: true,
        timezone: 'UTC',
        scheduledStartAt: new Date('2026-10-30T09:00:00Z'),
        scheduledEndAt: new Date('2026-10-30T18:00:00Z'),
        lateCheckinGraceMinutes: 15,
        earlyCheckoutGraceMinutes: 0,
        lateCheckoutGraceMinutes: 0,
      },
    },
  ])(
    'should return the day schedule snapshot when $condition',
    ({ businessDate, scheduleVersion, calendarException, expected }) => {
      const daySchedule = resolveDaySchedule({ businessDate, scheduleVersion, calendarException });

      expect(daySchedule).toEqual(expected);
    },
  );

  it.each([
    {
      condition: 'the zone is on daylight time on the business date',
      businessDate: '2026-10-30',
      expectedStartAt: new Date('2026-10-30T13:00:00Z'),
    },
    {
      condition: 'the zone is on standard time on the business date after the clocks go back',
      businessDate: '2026-11-02',
      expectedStartAt: new Date('2026-11-02T14:00:00Z'),
    },
  ])(
    'should anchor 09:00 to the offset in effect when $condition',
    ({ businessDate, expectedStartAt }) => {
      const daySchedule = resolveDaySchedule({
        businessDate,
        scheduleVersion: { ...DEFAULT_SCHEDULE_VERSION, timezone: 'America/New_York' },
        calendarException: null,
      });

      expect(daySchedule).toMatchObject({ isWorkingDay: true, scheduledStartAt: expectedStartAt });
    },
  );
});

describe('classifyCheckIn', () => {
  it.each([
    {
      condition: 'the punch is 08:59 WIB, one minute before the scheduled start',
      daySchedule: REGULAR_FRIDAY,
      recordedAt: new Date('2026-10-30T08:59:00+07:00'),
      expected: 'EARLY_CHECKIN',
    },
    {
      condition: 'the punch is exactly the scheduled start',
      daySchedule: REGULAR_FRIDAY,
      recordedAt: new Date('2026-10-30T09:00:00+07:00'),
      expected: 'ON_TIME_CHECKIN',
    },
    {
      condition: 'the punch is 09:15, the end of the late grace',
      daySchedule: REGULAR_FRIDAY,
      recordedAt: new Date('2026-10-30T09:15:00+07:00'),
      expected: 'ON_TIME_CHECKIN',
    },
    {
      condition: 'the punch is 09:16, one minute after the late grace',
      daySchedule: REGULAR_FRIDAY,
      recordedAt: new Date('2026-10-30T09:16:00+07:00'),
      expected: 'LATE_CHECKIN',
    },
    {
      condition: 'the punch is 09:15:59.999, still inside the 09:15 minute',
      daySchedule: REGULAR_FRIDAY,
      recordedAt: new Date('2026-10-30T09:15:59.999+07:00'),
      expected: 'ON_TIME_CHECKIN',
    },
    {
      condition: 'the punch is 08:59:59.999, still inside the 08:59 minute',
      daySchedule: REGULAR_FRIDAY,
      recordedAt: new Date('2026-10-30T08:59:59.999+07:00'),
      expected: 'EARLY_CHECKIN',
    },
    {
      condition: 'the punch is 09:20 on a holiday',
      daySchedule: HOLIDAY_FRIDAY,
      recordedAt: new Date('2026-10-30T09:20:00+07:00'),
      expected: 'CHECKIN_NOT_REQUIRED',
    },
    {
      condition: 'the punch is 09:20 on a regular Saturday',
      daySchedule: REGULAR_SATURDAY,
      recordedAt: new Date('2026-10-31T09:20:00+07:00'),
      expected: 'CHECKIN_NOT_REQUIRED',
    },
    {
      condition: 'the punch is 09:20 on a special working Saturday',
      daySchedule: SPECIAL_WORKING_SATURDAY,
      recordedAt: new Date('2026-10-31T09:20:00+07:00'),
      expected: 'LATE_CHECKIN',
    },
    {
      condition: 'the punch is WIB midnight that starts the business date',
      daySchedule: REGULAR_FRIDAY,
      recordedAt: new Date('2026-10-29T17:00:00Z'),
      expected: 'EARLY_CHECKIN',
    },
    {
      condition: 'the UTC clock reads 09:00 but the WIB clock reads 16:00',
      daySchedule: REGULAR_FRIDAY,
      recordedAt: new Date('2026-10-30T09:00:00Z'),
      expected: 'LATE_CHECKIN',
    },
  ])('should return $expected when $condition', ({ daySchedule, recordedAt, expected }) => {
    expect(classifyCheckIn(recordedAt, daySchedule)).toBe(expected);
  });

  it.each([
    {
      condition: 'the late grace is zero and the punch is one minute after the start',
      daySchedule: resolveDaySchedule({
        businessDate: '2026-10-30',
        scheduleVersion: { ...DEFAULT_SCHEDULE_VERSION, lateCheckinGraceMinutes: 0 },
        calendarException: null,
      }),
      recordedAt: new Date('2026-10-30T09:01:00+07:00'),
      expected: 'LATE_CHECKIN',
    },
    {
      condition: 'the late grace is zero and the punch is exactly the start',
      daySchedule: resolveDaySchedule({
        businessDate: '2026-10-30',
        scheduleVersion: { ...DEFAULT_SCHEDULE_VERSION, lateCheckinGraceMinutes: 0 },
        calendarException: null,
      }),
      recordedAt: new Date('2026-10-30T09:00:00+07:00'),
      expected: 'ON_TIME_CHECKIN',
    },
  ])('should return $expected when $condition', ({ daySchedule, recordedAt, expected }) => {
    expect(classifyCheckIn(recordedAt, daySchedule)).toBe(expected);
  });
});

describe('classifyCheckOut', () => {
  it.each([
    {
      condition: 'the punch is 17:59 WIB, one minute before the scheduled end',
      daySchedule: REGULAR_FRIDAY,
      recordedAt: new Date('2026-10-30T17:59:00+07:00'),
      expected: 'EARLY_CHECKOUT',
    },
    {
      condition: 'the punch is exactly the scheduled end',
      daySchedule: REGULAR_FRIDAY,
      recordedAt: new Date('2026-10-30T18:00:00+07:00'),
      expected: 'ON_TIME_CHECKOUT',
    },
    {
      condition: 'the punch is 18:01, one minute after the scheduled end',
      daySchedule: REGULAR_FRIDAY,
      recordedAt: new Date('2026-10-30T18:01:00+07:00'),
      expected: 'LATE_CHECKOUT',
    },
    {
      condition: 'the punch is 17:59:59.999, still inside the 17:59 minute',
      daySchedule: REGULAR_FRIDAY,
      recordedAt: new Date('2026-10-30T17:59:59.999+07:00'),
      expected: 'EARLY_CHECKOUT',
    },
    {
      condition: 'the punch is 18:00:59, still inside the 18:00 minute',
      daySchedule: REGULAR_FRIDAY,
      recordedAt: new Date('2026-10-30T18:00:59+07:00'),
      expected: 'ON_TIME_CHECKOUT',
    },
    {
      condition: 'the punch is 18:30 on a holiday',
      daySchedule: HOLIDAY_FRIDAY,
      recordedAt: new Date('2026-10-30T18:30:00+07:00'),
      expected: 'CHECKOUT_NOT_REQUIRED',
    },
    {
      condition: 'the punch is 17:00 on a regular Saturday',
      daySchedule: REGULAR_SATURDAY,
      recordedAt: new Date('2026-10-31T17:00:00+07:00'),
      expected: 'CHECKOUT_NOT_REQUIRED',
    },
    {
      condition: 'the punch is 17:00 on a special working Saturday',
      daySchedule: SPECIAL_WORKING_SATURDAY,
      recordedAt: new Date('2026-10-31T17:00:00+07:00'),
      expected: 'EARLY_CHECKOUT',
    },
    {
      condition: 'the punch is 23:59 WIB on the business date',
      daySchedule: REGULAR_FRIDAY,
      recordedAt: new Date('2026-10-30T23:59:00+07:00'),
      expected: 'LATE_CHECKOUT',
    },
    {
      condition: 'the punch is WIB midnight that ends the business date',
      daySchedule: REGULAR_FRIDAY,
      recordedAt: new Date('2026-10-30T17:00:00Z'),
      expected: 'LATE_CHECKOUT',
    },
  ])('should return $expected when $condition', ({ daySchedule, recordedAt, expected }) => {
    expect(classifyCheckOut(recordedAt, daySchedule)).toBe(expected);
  });

  it.each([
    {
      condition:
        'the punch is 17:54, one minute before the early checkout grace (early 5, late 10) starts',
      recordedAt: new Date('2026-10-30T17:54:00+07:00'),
      expected: 'EARLY_CHECKOUT',
    },
    {
      condition: 'the punch is 17:55, the start of the early checkout grace',
      recordedAt: new Date('2026-10-30T17:55:00+07:00'),
      expected: 'ON_TIME_CHECKOUT',
    },
    {
      condition: 'the punch is 18:10, the end of the late checkout grace',
      recordedAt: new Date('2026-10-30T18:10:00+07:00'),
      expected: 'ON_TIME_CHECKOUT',
    },
    {
      condition: 'the punch is 18:11, one minute after the late checkout grace',
      recordedAt: new Date('2026-10-30T18:11:00+07:00'),
      expected: 'LATE_CHECKOUT',
    },
  ])('should return $expected when $condition', ({ recordedAt, expected }) => {
    const daySchedule = resolveDaySchedule({
      businessDate: '2026-10-30',
      scheduleVersion: {
        ...DEFAULT_SCHEDULE_VERSION,
        earlyCheckoutGraceMinutes: 5,
        lateCheckoutGraceMinutes: 10,
      },
      calendarException: null,
    });

    expect(classifyCheckOut(recordedAt, daySchedule)).toBe(expected);
  });
});
