import axios, { isAxiosError } from 'axios';
import { ErrorCode, errorResponseSchema } from '@dexa/contracts';
import { toApiError } from './to-api-error.js';
import type { ApiErrorCode } from './api-error.js';
import type { AxiosInstance } from 'axios';

export type HttpClientOptions = {
  baseUrl: string;
  /** Reads the in-memory access token at request time. */
  getAccessToken: () => string | null;
  /**
   * Single-flight session refresh. Resolves true when the store now holds a fresh access token.
   * When it is set, exactly one 401 with the code UNAUTHORIZED (an expired access token) is retried
   * once after a successful refresh; a refusal rethrows the original response.
   */
  onAccessTokenExpired?: () => Promise<boolean>;
  /**
   * Called once for every 401 response that is not retried or that follows a failed refresh, with the
   * server's code (for example ACCOUNT_DISABLED), before the request rejects with an ApiError. Must
   * not throw. A failed login also answers 401 (INVALID_CREDENTIALS), so end the session only for
   * session codes such as UNAUTHORIZED or ACCOUNT_DISABLED, not for that one.
   */
  onUnauthorized?: (code: ApiErrorCode) => void;
};

const REQUEST_TIMEOUT_MS = 10_000;
const HTTP_STATUS_UNAUTHORIZED = 401;
const EXPIRED_TOKEN_CODE = ErrorCode.UNAUTHORIZED;

// Non-configurable: callers cannot send the path here except on purpose.
const SESSION_REFRESH_PATH = '/auth/refresh';

/**
 * Failed requests are never retried here, with one exception: a 401 UNAUTHORIZED from an expired
 * access token is retried once after a refresh, because the server refused only the token. Retrying
 * a POST, PUT, PATCH or DELETE after redirect errors could repeat a write, so every other failure
 * is left for the caller to choose.
 */
export function createHttpClient({
  baseUrl,
  getAccessToken,
  onAccessTokenExpired,
  onUnauthorized,
}: HttpClientOptions): AxiosInstance {
  const client = axios.create({ baseURL: baseUrl, timeout: REQUEST_TIMEOUT_MS });

  client.interceptors.request.use((request) => {
    const accessToken = getAccessToken();
    if (accessToken) request.headers.set('Authorization', `Bearer ${accessToken}`);
    return request;
  });

  // The retried request must not refresh again, so its config is remembered instead of mutated.
  const refreshedConfigs = new WeakSet<object>();

  client.interceptors.response.use(
    (response) => response,
    async (error: unknown) => {
      const config = isAxiosError(error) ? error.config : undefined;
      const isExpiredToken =
        config !== undefined &&
        !refreshedConfigs.has(config) &&
        !isSessionRefreshRequest(config.url) &&
        isExpiredAccessToken(error);
      if (isExpiredToken && onAccessTokenExpired !== undefined) {
        const isRefreshed = await onAccessTokenExpired().catch(() => false);
        if (isRefreshed) {
          refreshedConfigs.add(config);
          config.headers.set('Authorization', `Bearer ${getAccessToken() ?? ''}`);
          return client.request(config);
        }
      }
      const apiError = toApiError(error);
      if (apiError.status === HTTP_STATUS_UNAUTHORIZED) onUnauthorized?.(apiError.code);
      throw apiError;
    },
  );

  return client;
}

// A deactivation or wrong credentials is never retried, because no fresh token would fix it.
function isExpiredAccessToken(error: unknown): boolean {
  if (!isAxiosError(error) || error.response?.status !== HTTP_STATUS_UNAUTHORIZED) return false;
  const body = errorResponseSchema.safeParse(error.response.data);
  return body.success && body.data.code === EXPIRED_TOKEN_CODE;
}

function isSessionRefreshRequest(url: string | undefined): boolean {
  return url?.split('?')[0] === SESSION_REFRESH_PATH;
}
