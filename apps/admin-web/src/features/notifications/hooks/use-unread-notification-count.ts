import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { NotificationUnreadCount } from '@dexa/contracts';
import { useSession } from '@dexa/session';
import { notificationQueryKeys } from '../api/notification-query-keys.js';
import { fetchUnreadNotificationCount } from '../api/fetch-unread-notification-count.js';

/** The unread count for the navigation badge. A failed count shows no badge; it is never shown as zero. */
export function useUnreadNotificationCount(): UseQueryResult<NotificationUnreadCount, Error> {
  const { apiClient } = useSession();
  return useQuery({
    queryKey: notificationQueryKeys.unreadCount(),
    queryFn: () => fetchUnreadNotificationCount(apiClient),
    retry: false,
  });
}
