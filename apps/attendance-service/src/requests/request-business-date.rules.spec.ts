import { calendarDaysBetween, isWithinSubmissionWindow } from './request-business-date.rules.js';

describe('calendarDaysBetween', () => {
  it.each([
    {
      condition: 'the dates are the same day',
      earlier: '2026-10-31',
      later: '2026-10-31',
      expected: 0,
    },
    {
      condition: 'the later date is the next day',
      earlier: '2026-10-31',
      later: '2026-11-01',
      expected: 1,
    },
    {
      condition: 'the range crosses a month boundary',
      earlier: '2026-10-26',
      later: '2026-11-02',
      expected: 7,
    },
    {
      condition: 'the range covers the leap day 2028-02-29',
      earlier: '2028-02-28',
      later: '2028-03-01',
      expected: 2,
    },
    {
      condition: 'the range runs back across a year boundary',
      earlier: '2026-12-31',
      later: '2027-01-01',
      expected: 1,
    },
  ])('should return $expected when $condition', ({ earlier, later, expected }) => {
    expect(calendarDaysBetween(earlier, later)).toBe(expected);
  });

  it.each(['2026-02-30', '2027-02-29', '2026-10', '28-10-2026', ''])(
    'should throw a RangeError when the business date is %p',
    (businessDate) => {
      expect(() => calendarDaysBetween(businessDate, '2026-10-31')).toThrow(RangeError);
    },
  );
});

describe('isWithinSubmissionWindow', () => {
  it.each([
    { condition: 'the business date is today', businessDate: '2026-11-02', expected: true },
    { condition: 'the business date is 7 days back', businessDate: '2026-10-26', expected: true },
    { condition: 'the business date is 8 days back', businessDate: '2026-10-25', expected: false },
    { condition: 'the business date is tomorrow', businessDate: '2026-11-03', expected: false },
  ])(
    'should return $expected when $condition with a 7-day window',
    ({ businessDate, expected }) => {
      expect(isWithinSubmissionWindow({ businessDate, today: '2026-11-02', windowDays: 7 })).toBe(
        expected,
      );
    },
  );
});
