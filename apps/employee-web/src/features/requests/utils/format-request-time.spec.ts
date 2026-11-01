import { describe, expect, it } from 'vitest';
import { formatOptionalClockTime, formatRequestTimeRange } from './format-request-time.js';

describe('formatRequestTimeRange', () => {
  it.each([
    {
      case: 'a window that ends on the same WIB date',
      startAt: '2026-11-02T11:00:00.000Z',
      endAt: '2026-11-02T13:00:00.000Z',
      businessDate: '2026-11-02',
      expected: { text: '18:00–20:00', isNextDay: false },
    },
    {
      case: 'a window that ends after midnight WIB on the next business date',
      startAt: '2026-11-02T13:00:00.000Z',
      endAt: '2026-11-02T17:30:00.000Z',
      businessDate: '2026-11-02',
      expected: { text: '20:00–00:30', isNextDay: true },
    },
    {
      case: 'a window that ends at exactly midnight WIB',
      startAt: '2026-11-02T11:00:00.000Z',
      endAt: '2026-11-02T17:00:00.000Z',
      businessDate: '2026-11-02',
      expected: { text: '18:00–00:00', isNextDay: true },
    },
  ])(
    'should format the times in WIB and set isNextDay as expected for $case',
    ({ startAt, endAt, businessDate, expected }) => {
      expect(formatRequestTimeRange(startAt, endAt, businessDate)).toEqual(expected);
    },
  );
});

describe('formatOptionalClockTime', () => {
  it('should format an instant as HH:mm in WIB when a time is recorded', () => {
    expect(formatOptionalClockTime('2026-11-02T02:00:00.000Z')).toBe('09:00');
  });

  it('should return the dash when no time was requested', () => {
    expect(formatOptionalClockTime(null)).toBe('—');
  });
});
