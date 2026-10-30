import { BadRequestException, HttpException } from '@nestjs/common';
import { ErrorCode } from '@dexa/contracts';
import {
  ConflictError,
  DependencyUnavailableError,
  NotFoundError,
  PayloadTooLargeError,
} from './domain.errors.js';
import { toErrorResponse, UNEXPECTED_ERROR_MESSAGE } from './error-response.mapper.js';

describe('toErrorResponse', () => {
  it.each([
    { status: 400, code: 'VALIDATION_FAILED' },
    { status: 401, code: 'UNAUTHORIZED' },
    { status: 403, code: 'FORBIDDEN' },
    { status: 404, code: 'NOT_FOUND' },
    { status: 409, code: 'CONFLICT' },
    { status: 429, code: 'INTERNAL_ERROR' },
  ])(
    'should derive code $code when an HTTP exception has status $status and no body code',
    ({ status, code }) => {
      const response = toErrorResponse(new HttpException('Rejected.', status));

      expect(response).toEqual({ statusCode: status, code, message: 'Rejected.' });
    },
  );

  it('should use the body code when the HTTP exception body carries one', () => {
    const exception = new HttpException(
      { code: 'ATTENDANCE_DAY_ON_LEAVE', message: 'You are on leave today.' },
      409,
    );

    expect(toErrorResponse(exception)).toEqual({
      statusCode: 409,
      code: 'ATTENDANCE_DAY_ON_LEAVE',
      message: 'You are on leave today.',
    });
  });

  it('should join the messages with a semicolon when the body message is an array', () => {
    const exception = new BadRequestException(['email must be an email', 'name is required']);

    expect(toErrorResponse(exception).message).toBe('email must be an email; name is required');
  });

  it.each([
    {
      condition: 'the status is 5xx and the body has no code',
      exception: new HttpException('db.internal refused', 503),
      code: ErrorCode.INTERNAL_ERROR,
    },
    {
      condition: 'the status is 5xx and the body carries a code',
      exception: new HttpException({ code: ErrorCode.DEPENDENCY_UNAVAILABLE, message: 'x' }, 503),
      code: ErrorCode.DEPENDENCY_UNAVAILABLE,
    },
  ])('should withhold the message and keep the code when $condition', ({ exception, code }) => {
    expect(toErrorResponse(exception)).toEqual({
      statusCode: 503,
      code,
      message: UNEXPECTED_ERROR_MESSAGE,
    });
  });

  it('should use the domain status, code and message when the error is a domain error', () => {
    const error = new NotFoundError(ErrorCode.NOT_FOUND, 'Employee not found.');

    expect(toErrorResponse(error)).toEqual({
      statusCode: 404,
      code: ErrorCode.NOT_FOUND,
      message: 'Employee not found.',
    });
  });

  it('should use the domain status 503 when a dependency is unavailable', () => {
    const error = new DependencyUnavailableError(
      ErrorCode.DEPENDENCY_UNAVAILABLE,
      'Auth service did not respond.',
    );

    expect(toErrorResponse(error).statusCode).toBe(503);
  });

  it('should use the domain status 413 and its code when a payload is too large', () => {
    const error = new PayloadTooLargeError(ErrorCode.PHOTO_TOO_LARGE, 'The photo is too large.');

    expect(toErrorResponse(error)).toEqual({
      statusCode: 413,
      code: ErrorCode.PHOTO_TOO_LARGE,
      message: 'The photo is too large.',
    });
  });

  it('should use the status and message when a body-parser error exposes a 4xx status', () => {
    const parserError = Object.assign(new SyntaxError('Unexpected end of JSON input'), {
      statusCode: 400,
      expose: true,
    });

    expect(toErrorResponse(parserError)).toEqual({
      statusCode: 400,
      code: ErrorCode.VALIDATION_FAILED,
      message: 'Unexpected end of JSON input',
    });
  });

  it.each([
    {
      condition: 'the 4xx error does not expose its message',
      error: Object.assign(new Error('internal parser detail'), { statusCode: 400, expose: false }),
    },
    {
      condition: 'the status is 5xx even though the message is exposed',
      error: Object.assign(new Error('upstream detail'), { statusCode: 503, expose: true }),
    },
    {
      condition: 'the error is a plain Error carrying the SQL text',
      error: new Error('SELECT secret FROM accounts'),
    },
    { condition: 'the thrown value is a string', error: 'SELECT secret' },
    { condition: 'the thrown value is null', error: null },
  ])('should return the generic internal error when $condition', ({ error }) => {
    expect(toErrorResponse(error)).toEqual({
      statusCode: 500,
      code: ErrorCode.INTERNAL_ERROR,
      message: UNEXPECTED_ERROR_MESSAGE,
    });
  });
});

describe('toErrorResponse with details', () => {
  const details = { operationId: '0b6f7c0e-4f3a-4d55-9d1e-7a2b3c4d5e6f', savedPhase: 'RESERVED' };

  it('should include the details when the domain error carries them', () => {
    const error = new DependencyUnavailableError(
      ErrorCode.EMPLOYEE_PROVISIONING_INCOMPLETE,
      'Provisioning is incomplete.',
      { details },
    );

    expect(toErrorResponse(error)).toEqual({
      statusCode: 503,
      code: ErrorCode.EMPLOYEE_PROVISIONING_INCOMPLETE,
      message: 'Provisioning is incomplete.',
      details,
    });
  });

  it('should omit the details key when the domain error has no details', () => {
    const response = toErrorResponse(new ConflictError(ErrorCode.CONFLICT, 'Already exists.'));

    expect(response).toEqual({
      statusCode: 409,
      code: ErrorCode.CONFLICT,
      message: 'Already exists.',
    });
    expect(response).not.toHaveProperty('details');
  });
});
