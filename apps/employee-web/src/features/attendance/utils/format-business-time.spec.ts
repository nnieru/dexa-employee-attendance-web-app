import { describe, expect, it } from 'vitest';
import {
  formatBusinessDate,
  formatBusinessTime,
  formatScheduledHours,
} from './format-business-time.js';

describe('formatBusinessTime', () => {
  it.each([
    {
      condition: 'the instant is in the morning WIB',
      instant: '2026-11-02T01:02:00.000Z',
      text: '08:02 WIB',
    },
    {
      condition: 'the instant is just after WIB midnight',
      instant: '2026-11-01T17:00:00.000Z',
      text: '00:00 WIB',
    },
    {
      condition: 'the instant is 23:59 WIB',
      instant: '2026-11-02T16:59:00.000Z',
      text: '23:59 WIB',
    },
  ])('should format the time in WIB when $condition', ({ instant, text }) => {
    expect(formatBusinessTime(instant)).toBe(text);
  });
});

describe('formatBusinessDate', () => {
  it('should name the calendar date without shifting it to another day', () => {
    expect(formatBusinessDate('2026-11-01')).toBe('Sunday, November 1, 2026');
  });
});

describe('formatScheduledHours', () => {
  it('should show the scheduled range on a working day', () => {
    expect(
      formatScheduledHours({
        businessDate: '2026-11-02',
        isWorkingDay: true,
        scheduledStartAt: '2026-11-02T02:00:00.000Z',
        scheduledEndAt: '2026-11-02T11:00:00.000Z',
        state: { status: 'NOT_CLOCKED_IN' },
      }),
    ).toBe('09:00 WIB to 18:00 WIB');
  });

  it('should show the day-off text when today is not a working day', () => {
    expect(
      formatScheduledHours({
        businessDate: '2026-11-01',
        isWorkingDay: false,
        scheduledStartAt: null,
        scheduledEndAt: null,
        state: { status: 'NOT_CLOCKED_IN' },
      }),
    ).toBe('Day off');
  });
});
