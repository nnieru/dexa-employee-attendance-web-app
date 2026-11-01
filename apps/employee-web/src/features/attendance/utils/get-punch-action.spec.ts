import type { TodayAttendanceState } from '@dexa/contracts';
import { describe, expect, it } from 'vitest';
import { getPunchAction } from './get-punch-action.js';

const CLOCKED_IN_STATE: TodayAttendanceState = {
  status: 'CLOCKED_IN',
  clockInAt: '2026-11-02T02:20:00.000Z',
  clockInStatus: 'LATE_CHECKIN',
};
const DONE_STATE: TodayAttendanceState = {
  status: 'DONE',
  clockInAt: '2026-11-02T01:58:00.000Z',
  clockInStatus: 'ON_TIME_CHECKIN',
  clockOutAt: '2026-11-02T10:00:00.000Z',
  clockOutStatus: 'EARLY_CHECKOUT',
};

describe('getPunchAction', () => {
  it.each([
    {
      condition: 'not clocked in',
      state: { status: 'NOT_CLOCKED_IN' } as const,
      punchType: 'IN',
      isAvailable: true,
    },
    { condition: 'clocked in', state: CLOCKED_IN_STATE, punchType: 'OUT', isAvailable: true },
    { condition: 'done for the day', state: DONE_STATE, punchType: 'OUT', isAvailable: false },
  ])(
    'should offer the matching punch and availability when $condition',
    ({ state, punchType, isAvailable }) => {
      expect(getPunchAction(state)).toEqual({ punchType, isAvailable });
    },
  );
});
