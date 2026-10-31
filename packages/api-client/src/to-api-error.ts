import { ErrorCode, errorResponseSchema } from '@dexa/contracts';
import { isAxiosError } from 'axios';
import {
  ApiError,
  type ApiErrorCode,
  FALLBACK_ERROR_CODE,
  FALLBACK_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  NETWORK_ERROR_STATUS,
} from './api-error.js';

const KNOWN_ERROR_CODES: ReadonlySet<string> = new Set<string>(Object.values(ErrorCode));

function isKnownErrorCode(code: string): code is ErrorCode {
  return KNOWN_ERROR_CODES.has(code);
}

/**
 * Converts anything thrown by a request into an ApiError. Only the HTTP status and the parsed body
 * fields are copied; the transport error is dropped so its config, headers and token never escape.
 */
export function toApiError(error: unknown): ApiError {
  if (!isAxiosError(error) || !error.response) {
    return new ApiError({
      status: NETWORK_ERROR_STATUS,
      code: FALLBACK_ERROR_CODE,
      message: NETWORK_ERROR_MESSAGE,
    });
  }

  const { status, data } = error.response;
  const body = errorResponseSchema.safeParse(data);
  if (!body.success || body.data.message.trim().length === 0) {
    return new ApiError({ status, code: FALLBACK_ERROR_CODE, message: FALLBACK_ERROR_MESSAGE });
  }

  return new ApiError({
    status,
    code: toApiErrorCode(body.data.code),
    message: body.data.message,
  });
}

function toApiErrorCode(code: string): ApiErrorCode {
  return isKnownErrorCode(code) ? code : FALLBACK_ERROR_CODE;
}
