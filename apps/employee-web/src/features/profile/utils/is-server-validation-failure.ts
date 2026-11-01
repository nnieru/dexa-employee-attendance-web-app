import { ErrorCode } from '@dexa/contracts';
import { ApiError } from '@dexa/api-client';

/** True when the server refused the submitted values, so the message belongs on the field that was sent. */
export function isServerValidationFailure(error: unknown): boolean {
  return error instanceof ApiError && error.code === ErrorCode.VALIDATION_FAILED;
}
