import { REFRESH_TOKEN_COOKIE_NAME } from './refresh-token-cookie.js';

/** One `name=value` pair of a Cookie header, as RFC 6265 writes it. */
const COOKIE_PAIR_PATTERN = new RegExp(`(?:^|;\\s*)${REFRESH_TOKEN_COOKIE_NAME}=(?<value>[^;]*)`);

/**
 * Reads the refresh token from a Cookie header. Returns undefined when the header or the cookie is
 * missing; an empty value counts as missing, because no valid token is empty.
 */
export function readRefreshTokenCookie(cookieHeader: string | undefined): string | undefined {
  const value =
    cookieHeader === undefined ? undefined : COOKIE_PAIR_PATTERN.exec(cookieHeader)?.groups?.value;
  return value === undefined || value.length === 0 ? undefined : value;
}
