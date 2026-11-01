import { ApiError, FALLBACK_ERROR_MESSAGE } from '@dexa/api-client';

/**
 * The message for a failed profile change. An ApiError carries a user-safe message from the server or the
 * client (network and timeout included); anything else gets the generic fallback.
 */
export function getProfileErrorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : FALLBACK_ERROR_MESSAGE;
}
