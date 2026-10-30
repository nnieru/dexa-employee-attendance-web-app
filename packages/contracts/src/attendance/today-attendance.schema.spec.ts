import { todayAttendanceResponseSchema, todayStateSchema } from './today-attendance.schema.js';

const WORKING_DAY = {
  businessDate: '2026-11-02',
  isWorkingDay: true,
  scheduledStartAt: '2026-11-02T02:00:00.000Z',
  scheduledEndAt: '2026-11-02T11:00:00.000Z',
};
const DAY_OFF = {
  businessDate: '2026-11-07',
  isWorkingDay: false,
  scheduledStartAt: null,
  scheduledEndAt: null,
};
const CLOCKED_IN_STATE = {
  status: 'CLOCKED_IN',
  clockInAt: '2026-11-02T02:30:00.000Z',
  clockInStatus: 'LATE_CHECKIN',
};
const DONE_STATE = {
  status: 'DONE',
  clockInAt: '2026-11-02T02:30:00.000Z',
  clockInStatus: 'LATE_CHECKIN',
  clockOutAt: '2026-11-02T11:00:00.000Z',
  clockOutStatus: 'ON_TIME_CHECKOUT',
};

describe('todayAttendanceResponseSchema', () => {
  it.each([
    {
      condition: 'the day is a working day and not clocked in',
      body: { ...WORKING_DAY, state: { status: 'NOT_CLOCKED_IN' } },
    },
    {
      condition: 'the day is a working day and clocked in',
      body: { ...WORKING_DAY, state: CLOCKED_IN_STATE },
    },
    { condition: 'the day is a working day and done', body: { ...WORKING_DAY, state: DONE_STATE } },
    {
      condition: 'the day is off and not clocked in',
      body: { ...DAY_OFF, state: { status: 'NOT_CLOCKED_IN' } },
    },
  ])('should accept the response when $condition', ({ body }) => {
    expect(todayAttendanceResponseSchema.parse(body)).toEqual(body);
  });

  it.each([
    {
      condition: 'a working day has no scheduled start',
      body: { ...WORKING_DAY, scheduledStartAt: null, state: { status: 'NOT_CLOCKED_IN' } },
    },
    {
      condition: 'a day off has a scheduled start',
      body: {
        ...DAY_OFF,
        scheduledStartAt: '2026-11-07T02:00:00.000Z',
        state: { status: 'NOT_CLOCKED_IN' },
      },
    },
    {
      condition: 'the scheduled instant has a local offset instead of Z',
      body: {
        ...WORKING_DAY,
        scheduledStartAt: '2026-11-02T09:00:00+07:00',
        state: { status: 'NOT_CLOCKED_IN' },
      },
    },
  ])('should reject the response when $condition', ({ body }) => {
    expect(todayAttendanceResponseSchema.safeParse(body).success).toBe(false);
  });
});

describe('todayStateSchema', () => {
  it.each([
    { condition: 'the state is NOT_CLOCKED_IN', state: { status: 'NOT_CLOCKED_IN' } },
    { condition: 'the state is CLOCKED_IN', state: CLOCKED_IN_STATE },
    { condition: 'the state is DONE', state: DONE_STATE },
  ])('should accept the state when $condition', ({ state }) => {
    expect(todayStateSchema.parse(state)).toEqual(state);
  });

  it('should reject the state when the status is unknown', () => {
    expect(todayStateSchema.safeParse({ status: 'CLOCKED_OUT' }).success).toBe(false);
  });

  it('should reject the DONE state when the clock-out is missing', () => {
    const withoutCheckout = {
      status: 'DONE',
      clockInAt: DONE_STATE.clockInAt,
      clockInStatus: DONE_STATE.clockInStatus,
    };

    expect(todayStateSchema.safeParse(withoutCheckout).success).toBe(false);
  });

  it('should reject the CLOCKED_IN state when the check-in carries a check-out classification', () => {
    expect(
      todayStateSchema.safeParse({ ...CLOCKED_IN_STATE, clockInStatus: 'LATE_CHECKOUT' }).success,
    ).toBe(false);
  });
});
