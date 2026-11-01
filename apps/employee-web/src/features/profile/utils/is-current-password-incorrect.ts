import { ApiError } from '@dexa/api-client';
import { ErrorCode } from '@dexa/contracts';

/** True when the server refused the current password, so the message belongs on the current password field. */
export function isCurrentPasswordIncorrect(error: unknown): boolean {
  return error instanceof ApiError && error.code === ErrorCode.CURRENT_PASSWORD_INCORRECT;
}
