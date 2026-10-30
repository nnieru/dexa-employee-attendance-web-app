import type { TodayAttendanceState } from '@dexa/contracts';
import { buildTodayAttendance, deriveTodayState } from './today-state.rules.js';
import type { TodayDayRecord, TodayScheduleFields } from './today-state.repository.interface.js';

const MONDAY = '2026-11-02';
const CHECKIN_AT = new Date('2026-11-02T02:30:00Z');
const CHECKOUT_AT = new Date('2026-11-02T11:00:00Z');
const WORKING_SCHEDULE: TodayScheduleFields = {
  isWorkingDay: true,
  scheduledStartAt: new Date('2026-11-02T02:00:00Z'),
  scheduledEndAt: new Date('2026-11-02T11:00:00Z'),
};
const DAY_OFF_SCHEDULE: TodayScheduleFields = {
  isWorkingDay: false,
  scheduledStartAt: null,
  scheduledEndAt: null,
};

// A working day with a check-in classified late and no check-out yet.
const CHECKED_IN_DAY: TodayDayRecord = {
  schedule: WORKING_SCHEDULE,
  effectiveCheckinAt: CHECKIN_AT,
  checkinStatusCode: 'LATE_CHECKIN',
  effectiveCheckoutAt: null,
  checkoutStatusCode: 'PENDING_CHECKOUT',
};

describe('deriveTodayState', () => {
  it.each<{ condition: string; day: TodayDayRecord | undefined; expected: TodayAttendanceState }>([
    {
      condition: 'there is no attendance day',
      day: undefined,
      expected: { status: 'NOT_CLOCKED_IN' },
    },
    {
      condition: 'the day exists but has no effective check-in',
      day: { ...CHECKED_IN_DAY, effectiveCheckinAt: null, checkinStatusCode: 'PENDING_CHECKIN' },
      expected: { status: 'NOT_CLOCKED_IN' },
    },
    {
      condition: 'the day has a check-in and no check-out',
      day: CHECKED_IN_DAY,
      expected: {
        status: 'CLOCKED_IN',
        clockInAt: '2026-11-02T02:30:00.000Z',
        clockInStatus: 'LATE_CHECKIN',
      },
    },
    {
      condition: 'the day has both an effective check-in and check-out',
      day: {
        ...CHECKED_IN_DAY,
        effectiveCheckoutAt: CHECKOUT_AT,
        checkoutStatusCode: 'ON_TIME_CHECKOUT',
      },
      expected: {
        status: 'DONE',
        clockInAt: '2026-11-02T02:30:00.000Z',
        clockInStatus: 'LATE_CHECKIN',
        clockOutAt: '2026-11-02T11:00:00.000Z',
        clockOutStatus: 'ON_TIME_CHECKOUT',
      },
    },
    {
      condition: 'the day is off and a punch was recorded without a required classification',
      day: {
        schedule: DAY_OFF_SCHEDULE,
        effectiveCheckinAt: CHECKIN_AT,
        checkinStatusCode: 'CHECKIN_NOT_REQUIRED',
        effectiveCheckoutAt: CHECKOUT_AT,
        checkoutStatusCode: 'CHECKOUT_NOT_REQUIRED',
      },
      expected: {
        status: 'DONE',
        clockInAt: '2026-11-02T02:30:00.000Z',
        clockInStatus: 'CHECKIN_NOT_REQUIRED',
        clockOutAt: '2026-11-02T11:00:00.000Z',
        clockOutStatus: 'CHECKOUT_NOT_REQUIRED',
      },
    },
  ])('should derive the state when $condition', ({ day, expected }) => {
    expect(deriveTodayState(day)).toEqual(expected);
  });

  it('should reject the state when the day has a check-out but no check-in', () => {
    const brokenDay: TodayDayRecord = {
      ...CHECKED_IN_DAY,
      effectiveCheckinAt: null,
      effectiveCheckoutAt: CHECKOUT_AT,
      checkoutStatusCode: 'ON_TIME_CHECKOUT',
    };

    expect(() => deriveTodayState(brokenDay)).toThrow(
      'The attendance day has a check-out but no effective check-in.',
    );
  });
});

describe('buildTodayAttendance', () => {
  it('should show the given working-day instants in UTC when the day is a working day', () => {
    const response = buildTodayAttendance({
      businessDate: MONDAY,
      schedule: WORKING_SCHEDULE,
      day: undefined,
    });

    expect(response).toEqual({
      businessDate: MONDAY,
      isWorkingDay: true,
      scheduledStartAt: '2026-11-02T02:00:00.000Z',
      scheduledEndAt: '2026-11-02T11:00:00.000Z',
      state: { status: 'NOT_CLOCKED_IN' },
    });
  });

  it('should show null scheduled instants when the day is off', () => {
    const response = buildTodayAttendance({
      businessDate: MONDAY,
      schedule: DAY_OFF_SCHEDULE,
      day: undefined,
    });

    expect(response).toEqual({
      businessDate: MONDAY,
      isWorkingDay: false,
      scheduledStartAt: null,
      scheduledEndAt: null,
      state: { status: 'NOT_CLOCKED_IN' },
    });
  });

  it('should carry the state of the stored day beside the schedule it is given', () => {
    const response = buildTodayAttendance({
      businessDate: MONDAY,
      schedule: WORKING_SCHEDULE,
      day: CHECKED_IN_DAY,
    });

    expect(response.state).toEqual({
      status: 'CLOCKED_IN',
      clockInAt: '2026-11-02T02:30:00.000Z',
      clockInStatus: 'LATE_CHECKIN',
    });
  });
});
