import type { NotificationListQuery } from '@dexa/contracts';

// The HR inbox and its unread count. Every live event refreshes both, so the durable inbox stays the source of truth
// even when the toast was missed. Each inbox page has its own entry, keyed by its cursor and limit, and the prefix
// `inbox()` matches all of them for invalidation and for the mark-read cache update.
export const notificationQueryKeys = {
  all: ['notifications'] as const,
  inbox: () => [...notificationQueryKeys.all, 'inbox'] as const,
  inboxPage: (query: NotificationListQuery) => [...notificationQueryKeys.inbox(), query] as const,
  unreadCount: () => [...notificationQueryKeys.all, 'unread-count'] as const,
};
