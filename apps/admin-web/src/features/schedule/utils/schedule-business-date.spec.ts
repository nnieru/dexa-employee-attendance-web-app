import { describe, expect, it } from 'vitest';
import {
  addCalendarDays,
  getEarliestEffectiveFrom,
  toBusinessDate,
} from './schedule-business-date.js';

describe('toBusinessDate', () => {
  it.each([
    // 16:59 UTC is 23:59 WIB on the same day.
    ['2026-11-14T16:59:00.000Z', '2026-11-14'],
    // 17:00 UTC is 00:00 WIB the next day, so the WIB date has already moved on.
    ['2026-11-14T17:00:00.000Z', '2026-11-15'],
  ])('should give the WIB calendar date for %s', (instant, expected) => {
    expect(toBusinessDate(new Date(instant))).toBe(expected);
  });
});

describe('addCalendarDays', () => {
  it.each([
    ['2026-11-15', 1, '2026-11-16'],
    ['2026-11-30', 1, '2026-12-01'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2028-02-28', 1, '2028-02-29'],
    ['2026-11-15', -1, '2026-11-14'],
  ])('should move %s by %i days to %s', (businessDate, days, expected) => {
    expect(addCalendarDays(businessDate, days)).toBe(expected);
  });
});

describe('getEarliestEffectiveFrom', () => {
  it('should be tomorrow in WIB, so today is never accepted (SCH-4)', () => {
    expect(getEarliestEffectiveFrom('2026-11-15')).toBe('2026-11-16');
  });
});
