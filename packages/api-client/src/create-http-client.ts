import axios, { type AxiosInstance } from 'axios';
import type { ApiErrorCode } from './api-error.js';
import { toApiError } from './to-api-error.js';

export type HttpClientOptions = {
  baseUrl: string;
  /** Reads the in-memory access token at request time. */
  getAccessToken: () => string | null;
  /**
   * Called once for every 401 response with the server's code (for example ACCOUNT_DISABLED), before the
   * request rejects with an ApiError. Must not throw. A failed login also answers 401 (INVALID_CREDENTIALS),
   * so end the session only for session codes such as UNAUTHORIZED or ACCOUNT_DISABLED, not for that one.
   */
  onUnauthorized?: (code: ApiErrorCode) => void;
};

const REQUEST_TIMEOUT_MS = 10_000;
const HTTP_STATUS_UNAUTHORIZED = 401;

/**
 * Failed requests are never retried here. Retrying a POST, PUT, PATCH or DELETE could repeat a write,
 * so a caller that wants a retry must choose it for an idempotent request.
 */
export function createHttpClient({
  baseUrl,
  getAccessToken,
  onUnauthorized,
}: HttpClientOptions): AxiosInstance {
  const client = axios.create({ baseURL: baseUrl, timeout: REQUEST_TIMEOUT_MS });

  client.interceptors.request.use((request) => {
    const accessToken = getAccessToken();
    if (accessToken) request.headers.set('Authorization', `Bearer ${accessToken}`);
    return request;
  });

  client.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
      const apiError = toApiError(error);
      if (apiError.status === HTTP_STATUS_UNAUTHORIZED) onUnauthorized?.(apiError.code);
      throw apiError;
    },
  );

  return client;
}
