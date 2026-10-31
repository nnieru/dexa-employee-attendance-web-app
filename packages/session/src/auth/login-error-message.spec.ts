import { ApiError, FALLBACK_ERROR_MESSAGE } from '@dexa/api-client';
import { describe, expect, it } from 'vitest';
import {
  DisallowedRoleLoginError,
  getLoginErrorMessage,
  INVALID_LOGIN_MESSAGE,
} from './login-error-message.js';

describe('getLoginErrorMessage', () => {
  it.each([
    {
      condition: 'the credentials are rejected with 401',
      error: new ApiError({ status: 401, code: 'INVALID_CREDENTIALS', message: 'Server text' }),
      expected: INVALID_LOGIN_MESSAGE,
    },
    {
      condition: 'a deactivated account is refused with 401 on login',
      error: new ApiError({ status: 401, code: 'ACCOUNT_DISABLED', message: 'Server text' }),
      expected: INVALID_LOGIN_MESSAGE,
    },
    {
      condition: 'the account role is not allowed on this portal',
      error: new DisallowedRoleLoginError(),
      expected: INVALID_LOGIN_MESSAGE,
    },
    {
      condition: 'the server fails with a 500',
      error: new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'Server text' }),
      expected: 'Server text',
    },
    {
      condition: 'the error is not an API error',
      error: new Error('socket hang up'),
      expected: FALLBACK_ERROR_MESSAGE,
    },
  ])('should return the matching message when $condition', ({ error, expected }) => {
    expect(getLoginErrorMessage(error)).toBe(expected);
  });
});
