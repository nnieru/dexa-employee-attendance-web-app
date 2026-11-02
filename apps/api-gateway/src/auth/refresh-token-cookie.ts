import { API_PREFIX } from '@dexa/contracts';

// The refresh token reaches the browser only through this cookie, never through a response body or
// script-readable storage (ARCHITECTURE §13). The path limits the cookie to the auth routes, so it
// is not sent with any other API call.
export const REFRESH_TOKEN_COOKIE_NAME = 'dexa_refresh_token';
export const REFRESH_TOKEN_COOKIE_PATH = `/${API_PREFIX}/auth`;

export type RefreshTokenCookieOptions = {
  readonly httpOnly: true;
  readonly sameSite: 'lax';
  readonly path: string;
  readonly maxAge: number;
  readonly secure: boolean;
};

/**
 * Builds the cookie options for a refresh token answer. `isHttps` comes from the forwarded protocol
 * header, so a local plain-HTTP setup still works while a TLS deployment sets the Secure flag.
 */
export function buildRefreshTokenCookieOptions(
  maxAgeSeconds: number,
  isHttps: boolean,
): RefreshTokenCookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: REFRESH_TOKEN_COOKIE_PATH,
    maxAge: maxAgeSeconds * 1000,
    secure: isHttps,
  };
}
