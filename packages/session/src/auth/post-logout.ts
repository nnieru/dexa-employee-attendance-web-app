import type { ApiClient } from '../session-http-client.js';

const LOGOUT_PATH = '/auth/logout';

/** Drops the refresh-token cookie through the gateway's public logout route. */
export async function postLogout(apiClient: ApiClient): Promise<void> {
  await apiClient.post(LOGOUT_PATH);
}
