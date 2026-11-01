import type { Notification, NotificationPage } from '@dexa/contracts';

/**
 * Returns the page with the updated notification in place of the one with the same ID. A page that does not hold
 * the notification, or a page that is not cached, is returned unchanged.
 */
export function replaceNotificationInPage(
  page: NotificationPage | undefined,
  updatedNotification: Notification,
): NotificationPage | undefined {
  if (page === undefined) return undefined;
  const holdsNotification = page.items.some((item) => item.id === updatedNotification.id);
  if (!holdsNotification) return page;
  return {
    ...page,
    items: page.items.map((item) =>
      item.id === updatedNotification.id ? updatedNotification : item,
    ),
  };
}
