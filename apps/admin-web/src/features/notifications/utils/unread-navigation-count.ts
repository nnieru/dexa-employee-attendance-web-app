import type { AppShellNavCount } from '@dexa/ui';

/**
 * The badge beside Notifications in the navigation. Nothing is shown for zero unread or while the count is unknown,
 * because a missing count must not look like an empty inbox.
 */
export function getUnreadNavigationCount(
  unreadCount: number | undefined,
): AppShellNavCount | undefined {
  if (unreadCount === undefined || unreadCount === 0) return undefined;
  return { value: unreadCount, unit: 'unread' };
}
