import { describe, expect, it } from 'vitest';
import { ApiError } from '@dexa/api-client';
import { ErrorCode } from '@dexa/contracts';
import {
  getUpdateEmployeeFieldError,
  isEmployeeNotFoundError,
  isPartialUpdateError,
} from './update-employee-messages.js';

function apiError(code: ErrorCode, message: string, status = 400): ApiError {
  return new ApiError({ status, code, message });
}

describe('getUpdateEmployeeFieldError', () => {
  it.each([
    {
      caseName: 'a validation message names a form field',
      error: apiError(
        ErrorCode.VALIDATION_FAILED,
        'positionId: must reference an existing active position.',
      ),
      expected: { field: 'positionId', message: 'must reference an existing active position.' },
    },
    {
      caseName: 'the first of several issues names the field',
      error: apiError(ErrorCode.VALIDATION_FAILED, 'phoneNumber: bad format; name: too long'),
      expected: { field: 'phoneNumber', message: 'bad format' },
    },
    {
      caseName: 'the message names no form field',
      error: apiError(
        ErrorCode.VALIDATION_FAILED,
        '(body): must include at least one field to update',
      ),
      expected: undefined,
    },
    {
      caseName: 'the code is not a validation code',
      error: apiError(ErrorCode.CONFLICT, 'positionId: conflicting value', 409),
      expected: undefined,
    },
    {
      caseName: 'the error is not an API error',
      error: new Error('positionId: must reference an existing active position.'),
      expected: undefined,
    },
  ])('should return $expected when $caseName', ({ error, expected }) => {
    expect(getUpdateEmployeeFieldError(error)).toEqual(expected);
  });
});

describe('update error classifiers', () => {
  it('should recognise a partial update only for EMPLOYEE_UPDATE_INCOMPLETE', () => {
    expect(isPartialUpdateError(apiError(ErrorCode.EMPLOYEE_UPDATE_INCOMPLETE, 'x', 503))).toBe(
      true,
    );
    expect(isPartialUpdateError(apiError(ErrorCode.CONFLICT, 'x', 409))).toBe(false);
  });

  it('should recognise a missing employee only for NOT_FOUND', () => {
    expect(isEmployeeNotFoundError(apiError(ErrorCode.NOT_FOUND, 'x', 404))).toBe(true);
    expect(isEmployeeNotFoundError(new Error('x'))).toBe(false);
  });
});
