import { fetchEventSource, type EventSourceMessage } from '@microsoft/fetch-event-source';
import { NOTIFICATION_STREAM_EVENT_NAME, type Notification } from '@dexa/contracts';
import { NotificationStreamRefusedError } from './notification-stream.errors.js';
import {
  calculateReconnectDelayMilliseconds,
  isRefusedStatus,
} from './notification-stream.rules.js';
import { parseNotificationEvent } from './parse-notification-event.js';

export type NotificationStreamHandlers = {
  onLive: () => void;
  onInterrupted: () => void;
  onStopped: (refusedStatus: number) => void;
  onNotification: (notification: Notification) => void;
};

export type OpenNotificationStreamOptions = {
  streamUrl: string;
  accessToken: string;
  signal: AbortSignal;
  handlers: NotificationStreamHandlers;
};

const EVENT_STREAM_CONTENT_TYPE = 'text/event-stream';

/**
 * Opens the HR notification stream with the Bearer header (the token is never in the URL). The promise settles when
 * the signal aborts, or rejects only after a 401 or 403, which is already reported through onStopped. Every other
 * failure is retried with backoff, and the retry is scheduled by the library through onerror's return value.
 */
export function openNotificationStream({
  streamUrl,
  accessToken,
  signal,
  handlers,
}: OpenNotificationStreamOptions): Promise<void> {
  let failedAttempts = 0;

  return fetchEventSource(streamUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
    // Keep the stream open in a background tab, so a hidden tab does not look like an interruption.
    openWhenHidden: true,
    onopen: async (response) => {
      const contentType = response.headers.get('content-type') ?? '';
      if (response.ok && contentType.startsWith(EVENT_STREAM_CONTENT_TYPE)) {
        failedAttempts = 0;
        handlers.onLive();
        return;
      }
      if (isRefusedStatus(response.status))
        throw new NotificationStreamRefusedError(response.status);
      throw new Error(`Notification stream answered with status ${response.status}.`);
    },
    onmessage: (message: EventSourceMessage) => {
      if (message.event !== NOTIFICATION_STREAM_EVENT_NAME) return;
      const notification = parseNotificationEvent(message.data);
      if (notification !== null) handlers.onNotification(notification);
    },
    // The library resolves without an error when the server ends the stream cleanly. Throwing here sends that end
    // through onerror, so a server-side close is retried like a dropped connection.
    onclose: () => {
      throw new Error('Notification stream closed by the server.');
    },
    onerror: (error: unknown) => {
      if (error instanceof NotificationStreamRefusedError) {
        handlers.onStopped(error.status);
        throw error;
      }
      handlers.onInterrupted();
      const retryDelayMilliseconds = calculateReconnectDelayMilliseconds(failedAttempts);
      failedAttempts += 1;
      return retryDelayMilliseconds;
    },
  });
}
