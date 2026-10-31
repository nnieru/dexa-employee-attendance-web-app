import { ApiError, FALLBACK_ERROR_MESSAGE } from '@dexa/api-client';

export const INVALID_LOGIN_MESSAGE = 'Incorrect email or password.';

const HTTP_STATUS_UNAUTHORIZED = 401;

// A rejected login says the same thing whatever the reason (AUTH-4), so no 401 reveals whether the
// email exists or whether the account is deactivated.
export function getLoginErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return FALLBACK_ERROR_MESSAGE;
  if (error.status === HTTP_STATUS_UNAUTHORIZED) return INVALID_LOGIN_MESSAGE;
  return error.message;
}
