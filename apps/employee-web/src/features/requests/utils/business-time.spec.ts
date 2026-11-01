import { describe, expect, it } from 'vitest';
import { shiftBusinessDate, toBusinessDate, toBusinessInstant } from './business-time.js';

describe('toBusinessDate', () => {
  it.each([
    ['2026-10-31T16:59:59.999Z', '2026-10-31', 'just before WIB midnight'],
    [
      '2026-10-31T17:00:00.000Z',
      '2026-11-01',
      'at WIB midnight, while UTC is still the day before',
    ],
  ])('should give the WIB date for %s as %s when %s', (instant, expected) => {
    expect(toBusinessDate(new Date(instant))).toBe(expected);
  });
});

describe('toBusinessInstant', () => {
  it.each([
    ['2026-11-02', '18:30', '2026-11-02T11:30:00.000Z', 'an evening start'],
    [
      '2026-11-02',
      '00:00',
      '2026-11-01T17:00:00.000Z',
      'WIB midnight, which is the day before in UTC',
    ],
    ['2026-11-02', '23:59', '2026-11-02T16:59:00.000Z', 'the last minute of the business date'],
    ['2026-11-03', '01:00', '2026-11-02T18:00:00.000Z', 'an end after midnight, on the next date'],
    ['2026-10-31', '07:00', '2026-10-31T00:00:00.000Z', 'the start of the UTC day'],
  ])('should give the instant for %s %s WIB as %s when %s', (businessDate, clockTime, expected) => {
    expect(toBusinessInstant(businessDate, clockTime)).toBe(expected);
  });

  it('should throw a RangeError when the date is not a calendar date', () => {
    expect(() => toBusinessInstant('2026-02-30', '10:00')).toThrow(RangeError);
  });
});

describe('shiftBusinessDate', () => {
  it.each([
    ['2026-11-02', -7, '2026-10-26', 'seven days back across a month boundary'],
    ['2026-11-01', 1, '2026-11-02', 'one day forward'],
    ['2026-12-31', 1, '2027-01-01', 'across a year boundary'],
    ['2026-03-01', -1, '2026-02-28', 'back into a non-leap February'],
  ])('should give %s shifted by %i days as %s when %s', (businessDate, days, expected) => {
    expect(shiftBusinessDate(businessDate, days)).toBe(expected);
  });
});
