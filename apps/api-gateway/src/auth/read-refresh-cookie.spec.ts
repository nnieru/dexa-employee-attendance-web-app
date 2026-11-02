import { API_PREFIX } from '@dexa/contracts';
import { REFRESH_TOKEN_COOKIE_PATH } from './refresh-token-cookie.js';
import { buildRefreshTokenCookieOptions } from './refresh-token-cookie.js';
import { REFRESH_TOKEN_COOKIE_NAME } from './refresh-token-cookie.js';
import { readRefreshTokenCookie } from './read-refresh-cookie.js';

describe('readRefreshTokenCookie', () => {
  it('should return the token when it is the only cookie', () => {
    expect(readRefreshTokenCookie(`${REFRESH_TOKEN_COOKIE_NAME}=token-1`)).toBe('token-1');
  });

  it('should return the token when other cookies surround it', () => {
    expect(readRefreshTokenCookie('theme=dark; dexa_refresh_token=token-1; consent=yes')).toBe(
      'token-1',
    );
  });

  it('should return undefined when the cookie header is missing', () => {
    expect(readRefreshTokenCookie(undefined)).toBeUndefined();
  });

  it('should return undefined when the cookie is absent', () => {
    expect(readRefreshTokenCookie('theme=dark')).toBeUndefined();
  });

  it('should return undefined when the cookie value is empty', () => {
    expect(readRefreshTokenCookie(`${REFRESH_TOKEN_COOKIE_NAME}=`)).toBeUndefined();
  });
});

describe('buildRefreshTokenCookieOptions', () => {
  it('should name attributes that keep the token script- and request-safe', () => {
    expect(buildRefreshTokenCookieOptions(28_800, false)).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      path: `/${API_PREFIX}/auth`,
      maxAge: 28_800 * 1000,
      secure: false,
    });
    expect(REFRESH_TOKEN_COOKIE_PATH).toBe(`/${API_PREFIX}/auth`);
  });

  it('should set the Secure flag when the request arrived over https', () => {
    expect(buildRefreshTokenCookieOptions(28_800, true).secure).toBe(true);
  });
});
