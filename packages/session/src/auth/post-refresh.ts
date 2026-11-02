import { loginResponseSchema, type LoginResponse } from '@dexa/contracts';
import { parseResponse } from '@dexa/api-client';
import type { ApiClient } from '../session-http-client.js';

const REFRESH_PATH = '/auth/refresh';

/**
 * Starts a new session from the refresh-token cookie the browser sends with this same-origin call.
 * A refusal rejects as an ApiError, which the session handling turns into a session end.
 */
export async function postRefresh(apiClient: ApiClient): Promise<LoginResponse> {
  const response = await apiClient.post<unknown>(REFRESH_PATH);
  return parseResponse(loginResponseSchema, response.data);
}

/** The request path of the refresh call, so the retry interceptor can leave it alone. */
export const SESSION_REFRESH_PATH = REFRESH_PATH;
