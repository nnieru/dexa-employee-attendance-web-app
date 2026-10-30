import { ErrorCode } from '@dexa/contracts';
import { NotFoundError } from '@dexa/common';

const PROFILE_NOT_FOUND_MESSAGE = 'Employee profile not found.';

/** An account with no employee row has no profile to read or change. */
export function profileNotFoundError(): NotFoundError {
  return new NotFoundError(ErrorCode.NOT_FOUND, PROFILE_NOT_FOUND_MESSAGE);
}
