import { describe, expect, it } from 'vitest';
import { getCorrectionDateBounds, isSelectableCorrectionDate } from './correction-date-window.js';

const TODAY = '2026-11-02';

describe('getCorrectionDateBounds', () => {
  it('should run from thirty days back through today', () => {
    expect(getCorrectionDateBounds(TODAY)).toEqual({ earliest: '2026-10-03', latest: TODAY });
  });
});

describe('isSelectableCorrectionDate', () => {
  it.each([
    { value: TODAY, expected: true, description: 'today' },
    { value: '2026-10-03', expected: true, description: 'thirty days back' },
    { value: '2026-10-02', expected: false, description: 'thirty-one days back' },
    { value: '2026-11-03', expected: false, description: 'tomorrow' },
    { value: '2026-02-30', expected: false, description: 'a date that does not exist' },
    { value: '', expected: false, description: 'an empty value' },
    { value: '02/11/2026', expected: false, description: 'a value that is not YYYY-MM-DD' },
  ])('should return $expected for $description', ({ value, expected }) => {
    expect(isSelectableCorrectionDate(value, TODAY)).toBe(expected);
  });
});
