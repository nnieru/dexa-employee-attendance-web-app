import { ErrorCode } from '@dexa/contracts';

/**
 * Code of a failed API call. A code the client does not know (for example one added by a newer server)
 * is replaced by FALLBACK_ERROR_CODE before it reaches an ApiError, so the type is exactly the
 * shared ErrorCode list and apps can switch over it exhaustively.
 */
export type ApiErrorCode = ErrorCode;

/** Status of a request that never got an HTTP response (network failure or timeout). */
export const NETWORK_ERROR_STATUS = 0;

export const FALLBACK_ERROR_CODE: ErrorCode = ErrorCode.INTERNAL_ERROR;

export const FALLBACK_ERROR_MESSAGE = 'Something went wrong. Try again.';

export const NETWORK_ERROR_MESSAGE = 'The server could not be reached. Try again.';

/**
 * A failed API call. Carries only the HTTP status, the server code and a user-safe message. It never
 * holds the raw transport error, the request config, headers or tokens.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor({ status, code, message }: { status: number; code: ApiErrorCode; message: string }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}
