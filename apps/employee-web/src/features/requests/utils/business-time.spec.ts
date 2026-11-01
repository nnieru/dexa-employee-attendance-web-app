import { describe, expect, it } from 'vitest';
import { toBusinessDate } from './business-time.js';

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
