import { describe, expect, it } from 'vitest';
import { formatOvertimeDuration, NO_OVERTIME_TEXT } from './format-overtime-duration.js';

describe('formatOvertimeDuration', () => {
  it.each([
    { minutes: 0, expected: NO_OVERTIME_TEXT },
    { minutes: 0.3, expected: '1m' },
    { minutes: 1, expected: '1m' },
    { minutes: 30, expected: '30m' },
    { minutes: 59.4, expected: '59m' },
    { minutes: 59.6, expected: '1h 0m' },
    { minutes: 60, expected: '1h 0m' },
    { minutes: 90, expected: '1h 30m' },
    { minutes: 90.5, expected: '1h 31m' },
    { minutes: 150, expected: '2h 30m' },
    { minutes: 1440, expected: '24h 0m' },
  ])('should format $minutes minutes as $expected', ({ minutes, expected }) => {
    expect(formatOvertimeDuration(minutes)).toBe(expected);
  });
});
