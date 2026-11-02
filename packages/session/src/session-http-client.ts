import { createHttpClient, type ApiErrorCode } from '@dexa/api-client';
import type { SessionEndReason } from './auth/session-end-reason.js';
import { getSessionEndReason } from './auth/get-session-end-reason.js';

/** The shared HTTP client type. Derived from the factory so features need no direct axios import. */
export type ApiClient = ReturnType<typeof createHttpClient>;

export type SessionHttpClientOptions = {
  baseUrl: string;
  getAccessToken: () => string | null;
  /**
   * Single-flight session refresh. Resolves true when the store now holds a fresh access token, so
   * the one request that hit an expired token can be retried once with it.
   */
  refreshSession: () => Promise<boolean>;
  /** Called for a 401 that ends a session. Not called for a failed login, which has no session to end. */
  onSessionEnded: (endReason: SessionEndReason) => void;
};

/**
 * One client per session provider, so every 401 reaches the same handler. The refresh token carries
 * the session across hard reloads and expiry: an expired access token (401 UNAUTHORIZED) is retried
 * once after a refresh; a deactivation or wrong credentials is never retried, because no fresh token
 * would fix it.
 */
export function createSessionHttpClient({
  baseUrl,
  getAccessToken,
  refreshSession,
  onSessionEnded,
}: SessionHttpClientOptions): ApiClient {
  return createHttpClient({
    baseUrl,
    getAccessToken,
    onAccessTokenExpired: refreshSession,
    onUnauthorized: (code: ApiErrorCode) => {
      const endReason = getSessionEndReason(code);
      // A 401 without a session (a failed login or refresh) is not a session end (INVALID_CREDENTIALS).
      if (endReason !== null && getAccessToken() !== null) onSessionEnded(endReason);
    },
  });
}
