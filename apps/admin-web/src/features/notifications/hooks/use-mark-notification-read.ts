import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { Notification, NotificationPage } from '@dexa/contracts';
import { useSession } from '@dexa/session';
import { markNotificationRead } from '../api/mark-notification-read.js';
import { notificationQueryKeys } from '../api/notification-query-keys.js';
import { replaceNotificationInPage } from '../utils/replace-notification-in-page.js';

/**
 * Marks one notification read. On success the server's copy replaces the item in every cached inbox page, so the
 * item shows its read state at once, and the unread count is fetched again rather than guessed. Repeating the call
 * keeps the first read time on the server, so a double click is harmless.
 */
export function useMarkNotificationRead(): UseMutationResult<Notification, Error, string> {
  const { apiClient } = useSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) => markNotificationRead(apiClient, notificationId),
    onSuccess: (updatedNotification) => {
      queryClient.setQueriesData<NotificationPage>(
        { queryKey: notificationQueryKeys.inbox() },
        (page) => replaceNotificationInPage(page, updatedNotification),
      );
      void queryClient.invalidateQueries({ queryKey: notificationQueryKeys.unreadCount() });
    },
  });
}
