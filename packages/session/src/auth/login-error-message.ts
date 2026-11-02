import { ApiError, FALLBACK_ERROR_MESSAGE } from '@dexa/api-client';

export const INVALID_LOGIN_MESSAGE = 'Incorrect email or password.';

const HTTP_STATUS_UNAUTHORIZED = 401;

/** A login that answers with a role this app does not accept is a failed login here, so it gets the same message. */
export class DisallowedRoleLoginError extends Error {}

// A rejected login says the same thing whatever the reason, so no 401 reveals whether the
// email exists or whether the account is deactivated.
export function getLoginErrorMessage(error: unknown): string {
  if (error instanceof DisallowedRoleLoginError) return INVALID_LOGIN_MESSAGE;
  if (!(error instanceof ApiError)) return FALLBACK_ERROR_MESSAGE;
  if (error.status === HTTP_STATUS_UNAUTHORIZED) return INVALID_LOGIN_MESSAGE;
  return error.message;
}
