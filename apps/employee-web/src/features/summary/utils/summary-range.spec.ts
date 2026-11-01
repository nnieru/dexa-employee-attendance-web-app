import { describe, expect, it } from 'vitest';
import {
  INVALID_DATE_MESSAGE,
  RANGE_ORDER_MESSAGE,
  getSummaryRangeError,
} from './summary-range.js';

describe('getSummaryRangeError', () => {
  it.each([
    { from: '2026-11-01', to: '2026-11-15', expected: undefined, case: 'an ordered range' },
    { from: '2026-11-15', to: '2026-11-15', expected: undefined, case: 'a one-day range' },
    { from: '2026-11-16', to: '2026-11-15', expected: RANGE_ORDER_MESSAGE, case: 'From after To' },
    { from: '', to: '2026-11-15', expected: INVALID_DATE_MESSAGE, case: 'an empty From' },
    {
      from: '2026-11-01',
      to: '2026-02-30',
      expected: INVALID_DATE_MESSAGE,
      case: 'a date that does not exist',
    },
  ])('should return $expected for $case', ({ from, to, expected }) => {
    expect(getSummaryRangeError({ from, to })).toBe(expected);
  });
});
