import { describe, expect, it } from 'vitest';
import {
  READ_NOTIFICATION,
  UNREAD_NOTIFICATION,
  buildNotificationPage,
} from '../../../test/notification-inbox-fixtures.js';
import { replaceNotificationInPage } from './replace-notification-in-page.js';

const READ_VERSION_OF_UNREAD = { ...UNREAD_NOTIFICATION, readAt: '2026-11-13T03:00:00.000Z' };

describe('replaceNotificationInPage', () => {
  it('should replace only the notification with the same ID', () => {
    const page = buildNotificationPage({
      items: [UNREAD_NOTIFICATION, READ_NOTIFICATION],
      nextCursor: 'c2',
    });

    expect(replaceNotificationInPage(page, READ_VERSION_OF_UNREAD)).toEqual({
      items: [READ_VERSION_OF_UNREAD, READ_NOTIFICATION],
      nextCursor: 'c2',
    });
  });

  it('should return the page unchanged when it does not hold the notification', () => {
    const page = buildNotificationPage({ items: [READ_NOTIFICATION] });

    expect(replaceNotificationInPage(page, READ_VERSION_OF_UNREAD)).toBe(page);
  });

  it('should return undefined when the page is not cached', () => {
    expect(replaceNotificationInPage(undefined, READ_VERSION_OF_UNREAD)).toBeUndefined();
  });
});
