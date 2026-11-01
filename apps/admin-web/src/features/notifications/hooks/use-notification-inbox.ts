import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { NotificationListQuery, NotificationPage } from '@dexa/contracts';
import { useSession } from '@dexa/session';
import { notificationQueryKeys } from '../api/notification-query-keys.js';
import { fetchNotificationInbox } from '../api/fetch-notification-inbox.js';

/**
 * One page of the HR inbox. The previous page stays on screen while the next one loads. A failure is not retried
 * silently: the list shows it with a Try again action.
 */
export function useNotificationInbox(
  query: NotificationListQuery,
): UseQueryResult<NotificationPage, Error> {
  const { apiClient } = useSession();
  return useQuery({
    queryKey: notificationQueryKeys.inboxPage(query),
    queryFn: () => fetchNotificationInbox(apiClient, query),
    placeholderData: keepPreviousData,
    retry: false,
  });
}
