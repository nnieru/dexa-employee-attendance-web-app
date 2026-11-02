import { API_PREFIX, Portal } from '@dexa/contracts';
import { REFRESH_TOKEN_COOKIE_PATH } from './refresh-token-cookie.js';
import { buildRefreshTokenCookieOptions } from './refresh-token-cookie.js';
import { getRefreshTokenCookieName } from './refresh-token-cookie.js';
import { readRefreshTokenCookie } from './read-refresh-cookie.js';

describe('readRefreshTokenCookie', () => {
  const cookieName = getRefreshTokenCookieName(Portal.HR);

  it('should return the token when it is the only cookie', () => {
    expect(readRefreshTokenCookie(`${cookieName}=token-1`, Portal.HR)).toBe('token-1');
  });

  it('should return the token when other cookies surround it', () => {
    expect(
      readRefreshTokenCookie(`theme=dark; ${cookieName}=token-1; consent=yes`, Portal.HR),
    ).toBe('token-1');
  });

  it('should return undefined when the cookie header is missing', () => {
    expect(readRefreshTokenCookie(undefined, Portal.HR)).toBeUndefined();
  });

  it('should return undefined when the cookie is absent', () => {
    expect(readRefreshTokenCookie('theme=dark', Portal.HR)).toBeUndefined();
  });

  it('should return undefined when the cookie value is empty', () => {
    expect(readRefreshTokenCookie(`${cookieName}=`, Portal.HR)).toBeUndefined();
  });

  it('should ignore a refresh cookie belonging to another portal', () => {
    expect(
      readRefreshTokenCookie(
        `${getRefreshTokenCookieName(Portal.EMPLOYEE)}=employee-token`,
        Portal.HR,
      ),
    ).toBeUndefined();
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
