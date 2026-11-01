import { describe, expect, it } from 'vitest';
import type { AttendanceSummaryItem } from '@dexa/contracts';
import { getCurrentRecordView, type CurrentRecordQueryState } from './get-current-record-view.js';

const RECORD: AttendanceSummaryItem = {
  businessDate: '2026-11-02',
  dayStatus: 'PRESENT',
  approvedOvertimeMinutes: 0,
  clockInAt: '2026-11-02T02:00:00.000Z',
  clockInStatus: 'ON_TIME_CHECKIN',
  clockOutAt: null,
  clockOutStatus: 'PENDING_CHECKOUT',
};

const SETTLED: CurrentRecordQueryState = {
  isDateSelectable: true,
  isPending: false,
  isPlaceholderData: false,
  isError: false,
  record: RECORD,
};

describe('getCurrentRecordView', () => {
  it.each([
    {
      description: 'the date is not selectable, even with a loaded row',
      state: { ...SETTLED, isDateSelectable: false },
      expected: { kind: 'choose-date' },
    },
    {
      description: 'the request failed',
      state: { ...SETTLED, isError: true, record: undefined },
      expected: { kind: 'error' },
    },
    {
      description: 'the first answer is pending',
      state: { ...SETTLED, isPending: true, record: undefined },
      expected: { kind: 'loading' },
    },
    {
      description: 'the rows shown are the previous date while the new date loads',
      state: { ...SETTLED, isPlaceholderData: true },
      expected: { kind: 'loading' },
    },
    {
      description: 'the date has no row',
      state: { ...SETTLED, record: null },
      expected: { kind: 'empty' },
    },
    {
      description: 'the date has a row',
      state: SETTLED,
      expected: { kind: 'record', record: RECORD },
    },
  ])('should be $expected.kind when $description', ({ state, expected }) => {
    expect(getCurrentRecordView(state)).toEqual(expected);
  });
});
