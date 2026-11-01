import { describe, expect, it } from 'vitest';
import { formatNotificationTime } from './format-notification-time.js';

describe('formatNotificationTime', () => {
  it.each([
    ['2026-11-13T01:02:00.000Z', '2026-11-13 08:02 WIB'],
    ['2026-11-13T17:30:00.000Z', '2026-11-14 00:30 WIB'],
  ])('should show the company time for %s as %s', (instant, expected) => {
    expect(formatNotificationTime(instant)).toBe(expected);
  });
});
