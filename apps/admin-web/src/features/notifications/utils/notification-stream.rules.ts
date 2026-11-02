export const NOTIFICATION_STREAM_RECONNECT_BASE_MILLISECONDS = 1_000;
export const NOTIFICATION_STREAM_RECONNECT_MAX_MILLISECONDS = 30_000;

export const HTTP_STATUS_UNAUTHORIZED = 401;
const HTTP_STATUS_FORBIDDEN = 403;

/**
 * Delay before the next attempt after `failedAttempts` failures in a row. It doubles from the base and stops at the
 * maximum, so a long outage retries every 30 seconds rather than hammering the gateway.
 */
export function calculateReconnectDelayMilliseconds(failedAttempts: number): number {
  const doubledDelay = NOTIFICATION_STREAM_RECONNECT_BASE_MILLISECONDS * 2 ** failedAttempts;
  return Math.min(doubledDelay, NOTIFICATION_STREAM_RECONNECT_MAX_MILLISECONDS);
}

// The token or the HR role is refused. Retrying the same token cannot succeed.
export function isRefusedStatus(status: number): boolean {
  return status === HTTP_STATUS_UNAUTHORIZED || status === HTTP_STATUS_FORBIDDEN;
}
