// The HR inbox and its unread count. Every live event refreshes both, so the durable inbox stays the source of truth
// even when the toast was missed. The inbox fetchers arrive with T-AWEB-08; until then these keys match nothing.
export const notificationQueryKeys = {
  all: ['notifications'] as const,
  inbox: () => [...notificationQueryKeys.all, 'inbox'] as const,
  unreadCount: () => [...notificationQueryKeys.all, 'unread-count'] as const,
};
