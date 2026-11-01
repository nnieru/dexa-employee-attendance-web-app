import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useSession } from '@dexa/session';
import { useToast } from '@dexa/ui';
import { useEffect, useState } from 'react';
import { notificationQueryKeys } from '../api/notification-query-keys.js';
import type { NotificationStreamState } from '../types/notification-stream-state.js';
import { openNotificationStream } from '../utils/open-notification-stream.js';
import { HTTP_STATUS_UNAUTHORIZED } from '../utils/notification-stream.rules.js';

type UseNotificationStreamOptions = {
  /** The gateway's API base URL, for example `/api/v1`. */
  apiBaseUrl: string;
};

const NOTIFICATION_STREAM_PATH = '/notifications/stream';
// The session check path. The shared client ends the session when it answers 401, as it does for every request.
const CURRENT_ACCOUNT_PATH = '/auth/me';

// Events missed while the stream was down are found in the durable inbox, so every new event and every reconnect
// refreshes the inbox and the unread count (DESIGN §8, DATABASE §7.3).
function refreshNotificationQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: notificationQueryKeys.inbox() });
  void queryClient.invalidateQueries({ queryKey: notificationQueryKeys.unreadCount() });
}

/**
 * Keeps the HR notification stream open while a session is signed in (ADM-5, EVT-2). Each valid notification shows a
 * toast and refreshes the inbox queries. The stream closes when the session ends or the component unmounts. Mount it
 * once, in the authenticated shell.
 */
export function useNotificationStream({
  apiBaseUrl,
}: UseNotificationStreamOptions): NotificationStreamState {
  const { session, apiClient } = useSession();
  const accessToken = session.status === 'signed-in' ? session.accessToken : null;
  const toast = useToast();
  const queryClient = useQueryClient();
  const [streamState, setStreamState] = useState<NotificationStreamState>('connecting');

  useEffect(() => {
    if (accessToken === null) return undefined;
    const abortController = new AbortController();

    // A refused stream rejects after onStopped has run. Nothing else rejects, so the rejection needs no handling.
    openNotificationStream({
      streamUrl: `${apiBaseUrl}${NOTIFICATION_STREAM_PATH}`,
      accessToken,
      signal: abortController.signal,
      handlers: {
        onLive: () => {
          setStreamState('live');
          refreshNotificationQueries(queryClient);
        },
        onInterrupted: () => setStreamState('interrupted'),
        onStopped: (refusedStatus) => {
          setStreamState('stopped');
          // A 401 can mean the session has ended. The check goes through the shared client, whose 401 handler then
          // ends the session the usual way. Any other failure of the check is left to the session's own checks.
          if (refusedStatus === HTTP_STATUS_UNAUTHORIZED) {
            void apiClient.get(CURRENT_ACCOUNT_PATH).catch(() => undefined);
          }
        },
        onNotification: (notification) => {
          toast.showToast({ message: notification.title });
          refreshNotificationQueries(queryClient);
        },
      },
    }).catch(() => undefined);

    return () => abortController.abort();
  }, [accessToken, apiBaseUrl, apiClient, queryClient, toast]);

  return streamState;
}
