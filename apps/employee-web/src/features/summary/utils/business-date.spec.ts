import { describe, expect, it } from 'vitest';
import {
  formatBusinessDateTime,
  getMonthStartBusinessDate,
  isWithinCorrectionWindow,
  shiftBusinessDate,
  toBusinessDate,
} from './business-date.js';

describe('toBusinessDate', () => {
  it.each([
    ['2026-10-31T16:59:59.999Z', '2026-10-31', 'just before WIB midnight'],
    [
      '2026-10-31T17:00:00.000Z',
      '2026-11-01',
      'at WIB midnight, while UTC is still the day before',
    ],
    ['2026-11-01T12:00:00.000Z', '2026-11-01', 'midday UTC'],
  ])('should give the WIB date for %s as %s when %s', (instant, expected) => {
    expect(toBusinessDate(new Date(instant))).toBe(expected);
  });
});

describe('getMonthStartBusinessDate', () => {
  it.each([
    ['2026-11-15', '2026-11-01'],
    ['2026-11-01', '2026-11-01'],
    ['2026-12-31', '2026-12-01'],
  ])('should give the first day of the month for %s as %s', (businessDate, expected) => {
    expect(getMonthStartBusinessDate(businessDate)).toBe(expected);
  });
});

describe('formatBusinessDateTime', () => {
  it('should format a UTC instant as YYYY-MM-DD HH:mm in WIB', () => {
    expect(formatBusinessDateTime('2026-11-02T01:58:00.000Z')).toBe('2026-11-02 08:58');
  });

  it('should move to the next WIB date when the UTC instant is after 17:00 UTC', () => {
    expect(formatBusinessDateTime('2026-11-02T17:30:00.000Z')).toBe('2026-11-03 00:30');
  });
});

describe('shiftBusinessDate', () => {
  it.each([
    ['2026-11-15', -30, '2026-10-16', 'thirty days back across a month boundary'],
    ['2026-03-01', -1, '2026-02-28', 'back into a non-leap February'],
    ['2026-12-31', 1, '2027-01-01', 'across a year boundary'],
  ])('should give %s shifted by %i days as %s when %s', (businessDate, days, expected) => {
    expect(shiftBusinessDate(businessDate, days)).toBe(expected);
  });
});

describe('isWithinCorrectionWindow', () => {
  it.each([
    { businessDate: '2026-11-15', today: '2026-11-15', expected: true, description: 'today' },
    {
      businessDate: '2026-10-16',
      today: '2026-11-15',
      expected: true,
      description: 'the oldest day in the 30-day window',
    },
    {
      businessDate: '2026-10-15',
      today: '2026-11-15',
      expected: false,
      description: 'one day older than the window',
    },
    {
      businessDate: '2026-11-16',
      today: '2026-11-15',
      expected: false,
      description: 'a day after today',
    },
  ])(
    'should return $expected for $businessDate with today $today when it is $description',
    ({ businessDate, today, expected }) => {
      expect(isWithinCorrectionWindow(businessDate, today)).toBe(expected);
    },
  );
});
