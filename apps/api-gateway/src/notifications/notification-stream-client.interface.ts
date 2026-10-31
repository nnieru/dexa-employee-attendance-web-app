export type NotificationStreamRequest = {
  // The end user's token. notification-service verifies it, so the gateway forwards it as it arrived.
  readonly accessToken: string;
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
