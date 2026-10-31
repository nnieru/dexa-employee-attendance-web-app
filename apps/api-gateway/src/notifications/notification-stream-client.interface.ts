import type { AuthenticatedUser } from '@dexa/common';

export type NotificationStreamRequest = {
  // The end user that api-gateway acts for. The stream is opened with a token that names this user (D-51).
  readonly user: AuthenticatedUser;
  // Aborts the upstream request when the browser leaves, so notification-service stops the stream too.
  readonly signal: AbortSignal;
};

/** The gateway's connection to the HR notification stream on notification-service. */
export interface INotificationStreamClient {
  /**
   * Opens the stream and resolves to its body once the answer's headers arrive. The body stays open for as long as
   * both sides keep it open. Rejects with a domain error when notification-service refuses the caller or cannot be
   * reached.
   */
  openStream(request: NotificationStreamRequest): Promise<ReadableStream<Uint8Array>>;
}

export const NOTIFICATION_STREAM_CLIENT = Symbol('INotificationStreamClient');
export const NOTIFICATION_SERVICE_BASE_URL = Symbol('NotificationServiceBaseUrl');
export const NOTIFICATION_STREAM_CONNECT_TIMEOUT = Symbol('NotificationStreamConnectTimeout');
// How often the gateway re-checks the account of an open stream (D-13). Injected so tests can use a short interval.
export const NOTIFICATION_STREAM_ACCOUNT_CHECK_MILLISECONDS = Symbol(
  'NotificationStreamAccountCheckMilliseconds',
);
