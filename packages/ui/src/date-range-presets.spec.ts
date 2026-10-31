import { describe, expect, it } from 'vitest';
import { calculateDateRangePreset, type DatePresetPeriod } from './date-range-presets.js';

const ONE_WEEK: DatePresetPeriod = { unit: 'days', count: 7 };
const ONE_MONTH: DatePresetPeriod = { unit: 'months', count: 1 };
const THREE_MONTHS: DatePresetPeriod = { unit: 'months', count: 3 };

describe('calculateDateRangePreset', () => {
  it.each([
    {
      case: 'a 31st with a 30-day previous month (D-52)',
      today: '2026-10-31',
      period: ONE_WEEK,
      from: '2026-10-25',
    },
    {
      case: 'a 31st with a 30-day previous month, one month (D-52)',
      today: '2026-10-31',
      period: ONE_MONTH,
      from: '2026-10-01',
    },
    {
      case: 'a 31st with three months back to a 31-day month (D-52)',
      today: '2026-10-31',
      period: THREE_MONTHS,
      from: '2026-08-01',
    },
    {
      case: 'the last day of February when one month back is shorter (D-52)',
      today: '2026-03-31',
      period: ONE_MONTH,
      from: '2026-03-01',
    },
    {
      case: 'a leap-year February when one month back lands on day 30 (2028 is a leap year)',
      today: '2028-03-30',
      period: ONE_MONTH,
      from: '2028-03-01',
    },
    {
      case: 'a non-leap February when one month back lands on day 29',
      today: '2027-03-29',
      period: ONE_MONTH,
      from: '2027-03-01',
    },
    {
      case: 'a year boundary for one month back',
      today: '2027-01-05',
      period: ONE_MONTH,
      from: '2026-12-06',
    },
    {
      case: 'a year boundary for one week back',
      today: '2027-01-05',
      period: ONE_WEEK,
      from: '2026-12-30',
    },
    {
      case: 'a year boundary for three months back',
      today: '2027-02-10',
      period: THREE_MONTHS,
      from: '2026-11-11',
    },
  ])('should start from $from and end on today when $case', ({ today, period, from }) => {
    expect(calculateDateRangePreset(today, period)).toEqual({ from, to: today });
  });

  it('should throw a RangeError when today does not exist in the calendar', () => {
    expect(() => calculateDateRangePreset('2026-02-30', ONE_MONTH)).toThrow(RangeError);
  });

  it('should throw a RangeError when today is not in YYYY-MM-DD form', () => {
    expect(() => calculateDateRangePreset('31/10/2026', ONE_MONTH)).toThrow(RangeError);
  });
});
