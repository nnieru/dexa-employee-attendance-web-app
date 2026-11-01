import { describe, expect, it } from 'vitest';
import { getUnreadNavigationCount } from './unread-navigation-count.js';

describe('getUnreadNavigationCount', () => {
  it.each([
    ['the count is not known yet', undefined, undefined],
    ['nothing is unread', 0, undefined],
    ['one entry is unread', 1, { value: 1, unit: 'unread' }],
    ['several entries are unread', 12, { value: 12, unit: 'unread' }],
  ])('should return the badge when %s', (_label, unreadCount, expected) => {
    expect(getUnreadNavigationCount(unreadCount)).toEqual(expected);
  });
});
