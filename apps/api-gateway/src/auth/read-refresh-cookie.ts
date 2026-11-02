import type { Portal } from '@dexa/contracts';
import { getRefreshTokenCookieName } from './refresh-token-cookie.js';

/**
 * Reads the refresh token from a Cookie header. Returns undefined when the header or the cookie is
 * missing; an empty value counts as missing, because no valid token is empty.
 */
export function readRefreshTokenCookie(
  cookieHeader: string | undefined,
  portal: Portal,
): string | undefined {
  const cookieName = getRefreshTokenCookieName(portal);
  const cookiePairPattern = new RegExp(`(?:^|;\\s*)${cookieName}=(?<value>[^;]*)`);
  const value =
    cookieHeader === undefined ? undefined : cookiePairPattern.exec(cookieHeader)?.groups?.value;
  return value === undefined || value.length === 0 ? undefined : value;
}
