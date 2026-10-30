import { UnauthorizedError } from '@dexa/common';
import { ErrorCode } from '@dexa/contracts';

// RFC 6750: the scheme name is case-insensitive, and the token is a single run of non-space characters.
const BEARER_PATTERN = /^Bearer (\S+)$/i;
const MISSING_TOKEN_MESSAGE = 'Sign in to continue.';

/** Returns the token from an Authorization header, or refuses the request when there is none. */
export function readBearerToken(authorization: string | undefined): string {
  const token = authorization === undefined ? undefined : BEARER_PATTERN.exec(authorization)?.[1];
  if (token === undefined) {
    throw new UnauthorizedError(ErrorCode.UNAUTHORIZED, MISSING_TOKEN_MESSAGE);
  }
  return token;
}
