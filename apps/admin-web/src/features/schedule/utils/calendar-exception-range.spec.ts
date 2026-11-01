import { describe, expect, it } from 'vitest';
import { DEFAULT_PAGE_SIZE } from '@dexa/contracts';
import {
  INVALID_RANGE_DATE_MESSAGE,
  RANGE_ORDER_MESSAGE,
  getCalendarExceptionRangeError,
  getDefaultCalendarExceptionRange,
  toCalendarExceptionQuery,
} from './calendar-exception-range.js';

describe('getDefaultCalendarExceptionRange', () => {
  it('should run from tomorrow through the last day of the month three months ahead', () => {
    expect(getDefaultCalendarExceptionRange('2026-11-15')).toEqual({
      from: '2026-11-16',
      to: '2027-02-28',
    });
  });

  it('should reach the last day of a 31-day month', () => {
    expect(getDefaultCalendarExceptionRange('2026-10-31')).toEqual({
      from: '2026-11-01',
      to: '2027-01-31',
    });
  });
});

describe('getCalendarExceptionRangeError', () => {
  it('should accept a range whose From is not after To', () => {
    expect(
      getCalendarExceptionRangeError({ from: '2026-11-16', to: '2026-11-16' }),
    ).toBeUndefined();
  });

  it('should refuse a From after To', () => {
    expect(getCalendarExceptionRangeError({ from: '2026-12-01', to: '2026-11-30' })).toBe(
      RANGE_ORDER_MESSAGE,
    );
  });

  it.each([
    ['an empty date', { from: '', to: '2026-11-30' }],
    ['a month that does not exist', { from: '2026-13-01', to: '2026-11-30' }],
    ['a day that does not exist in the month', { from: '2026-02-30', to: '2026-11-30' }],
  ])('should refuse %s', (_label, range) => {
    expect(getCalendarExceptionRangeError(range)).toBe(INVALID_RANGE_DATE_MESSAGE);
  });
});

describe('toCalendarExceptionQuery', () => {
  it('should send the range and page with the shared default page size', () => {
    expect(toCalendarExceptionQuery({ from: '2026-11-16', to: '2027-02-28', page: 2 })).toEqual({
      from: '2026-11-16',
      to: '2027-02-28',
      page: 2,
      pageSize: DEFAULT_PAGE_SIZE,
    });
  });
});
