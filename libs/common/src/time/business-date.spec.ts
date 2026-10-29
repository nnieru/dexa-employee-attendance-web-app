import { getMonthStart, toBusinessDate } from './business-date.js';

describe('toBusinessDate', () => {
  it.each([
    {
      condition: 'the instant is 23:59 WIB on 2026-10-28',
      instant: '2026-10-28T16:59:00Z',
      timeZone: 'Asia/Jakarta',
      expected: '2026-10-28',
    },
    {
      condition: 'the instant is 00:01 WIB on 2026-10-29',
      instant: '2026-10-28T17:01:00Z',
      timeZone: 'Asia/Jakarta',
      expected: '2026-10-29',
    },
    {
      condition: 'the instant is the last millisecond before WIB midnight',
      instant: '2026-10-28T16:59:59.999Z',
      timeZone: 'Asia/Jakarta',
      expected: '2026-10-28',
    },
    {
      condition: 'the instant is exactly WIB midnight',
      instant: '2026-10-28T17:00:00Z',
      timeZone: 'Asia/Jakarta',
      expected: '2026-10-29',
    },
    {
      condition: 'the instant is 23:59 WIB on the last day of October',
      instant: '2026-10-31T16:59:00Z',
      timeZone: 'Asia/Jakarta',
      expected: '2026-10-31',
    },
    {
      condition: 'the instant is 00:01 WIB on the first day of November',
      instant: '2026-10-31T17:01:00Z',
      timeZone: 'Asia/Jakarta',
      expected: '2026-11-01',
    },
    {
      condition: 'the instant is 23:59 WIB on the last day of 2026',
      instant: '2026-12-31T16:59:00Z',
      timeZone: 'Asia/Jakarta',
      expected: '2026-12-31',
    },
    {
      condition: 'the instant is 00:01 WIB on the first day of 2027',
      instant: '2026-12-31T17:01:00Z',
      timeZone: 'Asia/Jakarta',
      expected: '2027-01-01',
    },
    {
      condition: 'the instant is 00:01 WIB on the leap day 2028-02-29',
      instant: '2028-02-28T17:01:00Z',
      timeZone: 'Asia/Jakarta',
      expected: '2028-02-29',
    },
    {
      condition: 'the instant is 23:59 WIB on the leap day 2028-02-29',
      instant: '2028-02-29T16:59:00Z',
      timeZone: 'Asia/Jakarta',
      expected: '2028-02-29',
    },
    {
      condition: 'the instant is exactly WIB midnight after the leap day',
      instant: '2028-02-29T17:00:00Z',
      timeZone: 'Asia/Jakarta',
      expected: '2028-03-01',
    },
    {
      condition: 'the local year is before 1000 and keeps its four digits',
      instant: '0999-06-01T00:00:00Z',
      timeZone: 'UTC',
      expected: '0999-06-01',
    },
    {
      condition: 'the instant is 23:59 on 2026-10-28 in UTC',
      instant: '2026-10-28T23:59:00Z',
      timeZone: 'UTC',
      expected: '2026-10-28',
    },
    {
      condition: 'the same instant is already 06:59 on 2026-10-29 in Asia/Jakarta',
      instant: '2026-10-28T23:59:00Z',
      timeZone: 'Asia/Jakarta',
      expected: '2026-10-29',
    },
    {
      condition: 'the instant is 22:00 on 2026-10-27 in America/New_York, a zone behind UTC',
      instant: '2026-10-28T02:00:00Z',
      timeZone: 'America/New_York',
      expected: '2026-10-27',
    },
    {
      condition: 'the local month and day are single digits',
      instant: '2026-03-05T12:00:00Z',
      timeZone: 'Asia/Jakarta',
      expected: '2026-03-05',
    },
  ])('should return $expected when $condition', ({ instant, timeZone, expected }) => {
    expect(toBusinessDate(new Date(instant), timeZone)).toBe(expected);
  });

  it('should throw a RangeError when the timezone is not an IANA zone name', () => {
    expect(() => toBusinessDate(new Date('2026-10-28T16:59:00Z'), 'WIB')).toThrow(RangeError);
  });
});

describe('getMonthStart', () => {
  it.each([
    {
      condition: 'the business date is in the middle of the month',
      businessDate: '2026-10-28',
      expected: '2026-10-01',
    },
    {
      condition: 'the business date is the first day of the month',
      businessDate: '2026-10-01',
      expected: '2026-10-01',
    },
    {
      condition: 'the business date is the leap day 2028-02-29',
      businessDate: '2028-02-29',
      expected: '2028-02-01',
    },
    {
      condition: 'the business date is the last day of the year',
      businessDate: '2026-12-31',
      expected: '2026-12-01',
    },
  ])('should return $expected when $condition', ({ businessDate, expected }) => {
    expect(getMonthStart(businessDate)).toBe(expected);
  });

  it.each([
    '2026-10',
    '2026-13-01',
    '2026-00-10',
    '2026-02-30',
    '2027-02-29',
    '28-10-2026',
    '2026-10-28T00:00:00Z',
    ' 2026-10-28',
    '2026-10-28\n',
    '',
  ])('should throw an invalid business date error when the input is %p', (businessDate) => {
    expect(() => getMonthStart(businessDate)).toThrow(/^Invalid business date:/);
  });
});
