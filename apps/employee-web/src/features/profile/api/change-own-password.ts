import type { ChangePasswordRequest } from '@dexa/contracts';
import type { ApiClient } from '@dexa/session';

export const OWN_PASSWORD_PATH = '/auth/me/password';

/** The server answers 204 with no body, so nothing is parsed. A refusal arrives as an ApiError. */
export async function changeOwnPassword(
  apiClient: ApiClient,
  request: ChangePasswordRequest,
): Promise<void> {
  await apiClient.patch<void>(OWN_PASSWORD_PATH, request);
}
