import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@dexa/contracts';
import {
  ConflictError,
  DependencyUnavailableError,
  ForbiddenError,
  NotFoundError,
  PayloadTooLargeError,
  UnauthorizedError,
  ValidationError,
  type DomainError,
} from '../errors/domain.errors.js';
import {
  DEPENDENCY_UNAVAILABLE_MESSAGE,
  MAX_GET_RETRIES,
  classifyStatus,
  shouldRetry,
  toFailureError,
  type AttemptFailure,
  type InternalHttpMethod,
} from './internal-http.rules.js';

const REMOTE_CODE = 'ATTENDANCE_ALREADY_CLOCKED_IN';
const REMOTE_MESSAGE = 'You are already clocked in.';
const CAUSE = new Error('transport failure');

function clientFailure(status: number, remoteBody: unknown): AttemptFailure {
  return { kind: 'client_error', status, remoteBody };
}

describe('shouldRetry', () => {
  const retryRows: ReadonlyArray<{
    condition: string;
    method: InternalHttpMethod;
    failure: AttemptFailure;
    attempt: number;
    expected: boolean;
  }> = [
    {
      condition: 'a GET got no response on its first attempt',
      method: 'GET',
      failure: { kind: 'no_response' },
      attempt: 1,
      expected: true,
    },
    {
      condition: 'a GET got 503 on its first attempt',
      method: 'GET',
      failure: { kind: 'server_error', status: HttpStatus.SERVICE_UNAVAILABLE },
      attempt: 1,
      expected: true,
    },
    {
      condition: 'a GET got 503 on the last attempt that may still be retried',
      method: 'GET',
      failure: { kind: 'server_error', status: HttpStatus.SERVICE_UNAVAILABLE },
      attempt: MAX_GET_RETRIES,
      expected: true,
    },
    {
      condition: 'a GET got 503 after every retry was used',
      method: 'GET',
      failure: { kind: 'server_error', status: HttpStatus.SERVICE_UNAVAILABLE },
      attempt: MAX_GET_RETRIES + 1,
      expected: false,
    },
    {
      condition: 'a GET got no response after every retry was used',
      method: 'GET',
      failure: { kind: 'no_response' },
      attempt: MAX_GET_RETRIES + 1,
      expected: false,
    },
    {
      condition: 'a POST got no response',
      method: 'POST',
      failure: { kind: 'no_response' },
      attempt: 1,
      expected: false,
    },
    {
      condition: 'a POST got 503',
      method: 'POST',
      failure: { kind: 'server_error', status: HttpStatus.SERVICE_UNAVAILABLE },
      attempt: 1,
      expected: false,
    },
    {
      condition: 'a PUT got no response',
      method: 'PUT',
      failure: { kind: 'no_response' },
      attempt: 1,
      expected: false,
    },
    {
      condition: 'a PATCH got no response',
      method: 'PATCH',
      failure: { kind: 'no_response' },
      attempt: 1,
      expected: false,
    },
    {
      condition: 'a PATCH got 503',
      method: 'PATCH',
      failure: { kind: 'server_error', status: HttpStatus.SERVICE_UNAVAILABLE },
      attempt: 1,
      expected: false,
    },
    {
      condition: 'a GET got a 4xx answer',
      method: 'GET',
      failure: clientFailure(HttpStatus.NOT_FOUND, undefined),
      attempt: 1,
      expected: false,
    },
    {
      condition: 'a GET got an unexpected redirect',
      method: 'GET',
      failure: { kind: 'unexpected_status', status: HttpStatus.MOVED_PERMANENTLY },
      attempt: 1,
      expected: false,
    },
  ];

  it.each(retryRows)(
    'should return $expected when $condition',
    ({ method, failure, attempt, expected }) => {
      expect(shouldRetry(method, failure, attempt)).toBe(expected);
    },
  );
});

describe('classifyStatus', () => {
  const remoteBody = { detail: 'No employee matches this request.' };

  it.each([
    {
      condition: 'the status is 503',
      status: HttpStatus.SERVICE_UNAVAILABLE,
      expected: { kind: 'server_error', status: HttpStatus.SERVICE_UNAVAILABLE },
    },
    {
      condition: 'the status is 404',
      status: HttpStatus.NOT_FOUND,
      expected: { kind: 'client_error', status: HttpStatus.NOT_FOUND, remoteBody },
    },
    {
      condition: 'the status is a redirect',
      status: HttpStatus.MOVED_PERMANENTLY,
      expected: { kind: 'unexpected_status', status: HttpStatus.MOVED_PERMANENTLY },
    },
  ])('should classify the answer when $condition', ({ status, expected }) => {
    expect(classifyStatus(status, remoteBody)).toEqual(expected);
  });
});

describe('toFailureError', () => {
  const failureRows: ReadonlyArray<{
    condition: string;
    failure: AttemptFailure;
    expectedClass: new (code: string, message: string, options?: ErrorOptions) => DomainError;
    expectedCode: string;
    expectedMessage: string;
  }> = [
    {
      condition: 'the 400 body has the shared error shape',
      failure: clientFailure(HttpStatus.BAD_REQUEST, {
        statusCode: 400,
        code: 'LEAVE_RANGE_INVALID',
        message: 'Leave end date is before its start date.',
      }),
      expectedClass: ValidationError,
      expectedCode: 'LEAVE_RANGE_INVALID',
      expectedMessage: 'Leave end date is before its start date.',
    },
    {
      // The refused token is this service's own, so the dependency is unavailable, not the session.
      condition: 'the 401 body has the shared error shape',
      failure: clientFailure(HttpStatus.UNAUTHORIZED, {
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Unauthorized',
      }),
      expectedClass: DependencyUnavailableError,
      expectedCode: ErrorCode.DEPENDENCY_UNAVAILABLE,
      expectedMessage: DEPENDENCY_UNAVAILABLE_MESSAGE,
    },
    {
      condition: 'the 401 body is missing',
      failure: clientFailure(HttpStatus.UNAUTHORIZED, undefined),
      expectedClass: DependencyUnavailableError,
      expectedCode: ErrorCode.DEPENDENCY_UNAVAILABLE,
      expectedMessage: DEPENDENCY_UNAVAILABLE_MESSAGE,
    },
    {
      condition: 'the 403 body has the shared error shape',
      failure: clientFailure(HttpStatus.FORBIDDEN, {
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Only HR can approve this request.',
      }),
      expectedClass: ForbiddenError,
      expectedCode: 'FORBIDDEN',
      expectedMessage: 'Only HR can approve this request.',
    },
    {
      condition: 'the 404 body has the shared error shape',
      failure: clientFailure(HttpStatus.NOT_FOUND, {
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Employee not found.',
      }),
      expectedClass: NotFoundError,
      expectedCode: 'NOT_FOUND',
      expectedMessage: 'Employee not found.',
    },
    {
      condition: 'the 409 body has the shared error shape',
      failure: clientFailure(HttpStatus.CONFLICT, {
        statusCode: 409,
        code: REMOTE_CODE,
        message: REMOTE_MESSAGE,
      }),
      expectedClass: ConflictError,
      expectedCode: REMOTE_CODE,
      expectedMessage: REMOTE_MESSAGE,
    },
    {
      condition: 'the 404 body is not an error response',
      failure: clientFailure(HttpStatus.NOT_FOUND, { detail: 'No employee matches.' }),
      expectedClass: NotFoundError,
      expectedCode: ErrorCode.NOT_FOUND,
      expectedMessage: 'The requested item was not found.',
    },
    {
      condition: 'the 409 body is plain text',
      failure: clientFailure(HttpStatus.CONFLICT, 'conflict'),
      expectedClass: ConflictError,
      expectedCode: ErrorCode.CONFLICT,
      expectedMessage: 'The request conflicts with the current state.',
    },
    {
      condition: 'the 413 body has the shared error shape',
      failure: clientFailure(HttpStatus.PAYLOAD_TOO_LARGE, {
        statusCode: 413,
        code: 'PHOTO_TOO_LARGE',
        message: 'The photo is too large.',
      }),
      expectedClass: PayloadTooLargeError,
      expectedCode: 'PHOTO_TOO_LARGE',
      expectedMessage: 'The photo is too large.',
    },
    {
      condition: 'the 413 body is missing',
      failure: clientFailure(HttpStatus.PAYLOAD_TOO_LARGE, undefined),
      expectedClass: PayloadTooLargeError,
      expectedCode: ErrorCode.PAYLOAD_TOO_LARGE,
      expectedMessage: 'The payload is too large.',
    },
    {
      condition: 'the 400 body is missing',
      failure: clientFailure(HttpStatus.BAD_REQUEST, undefined),
      expectedClass: ValidationError,
      expectedCode: ErrorCode.VALIDATION_FAILED,
      expectedMessage: 'The request is invalid.',
    },
    {
      condition: 'the status is 422, which has no client-facing error',
      failure: clientFailure(HttpStatus.UNPROCESSABLE_ENTITY, {
        statusCode: 422,
        code: 'SOMETHING',
        message: 'x',
      }),
      expectedClass: DependencyUnavailableError,
      expectedCode: ErrorCode.DEPENDENCY_UNAVAILABLE,
      expectedMessage: DEPENDENCY_UNAVAILABLE_MESSAGE,
    },
    {
      condition: 'the status is 429',
      failure: clientFailure(HttpStatus.TOO_MANY_REQUESTS, undefined),
      expectedClass: DependencyUnavailableError,
      expectedCode: ErrorCode.DEPENDENCY_UNAVAILABLE,
      expectedMessage: DEPENDENCY_UNAVAILABLE_MESSAGE,
    },
    {
      condition: 'the status is 503',
      failure: { kind: 'server_error', status: HttpStatus.SERVICE_UNAVAILABLE },
      expectedClass: DependencyUnavailableError,
      expectedCode: ErrorCode.DEPENDENCY_UNAVAILABLE,
      expectedMessage: DEPENDENCY_UNAVAILABLE_MESSAGE,
    },
    {
      condition: 'no response arrived',
      failure: { kind: 'no_response' },
      expectedClass: DependencyUnavailableError,
      expectedCode: ErrorCode.DEPENDENCY_UNAVAILABLE,
      expectedMessage: DEPENDENCY_UNAVAILABLE_MESSAGE,
    },
    {
      condition: 'the status is an unexpected redirect',
      failure: { kind: 'unexpected_status', status: HttpStatus.MOVED_PERMANENTLY },
      expectedClass: DependencyUnavailableError,
      expectedCode: ErrorCode.DEPENDENCY_UNAVAILABLE,
      expectedMessage: DEPENDENCY_UNAVAILABLE_MESSAGE,
    },
  ];

  it.each(failureRows)(
    'should return the matching domain error when $condition',
    ({ failure, expectedClass, expectedCode, expectedMessage }) => {
      const error = toFailureError(failure, CAUSE);

      expect(error).toBeInstanceOf(expectedClass);
      expect(error).toMatchObject({ code: expectedCode, message: expectedMessage });
      expect(error.cause).toBe(CAUSE);
    },
  );
});

describe('toFailureError with refusal codes', () => {
  const REFUSAL_CODE = 'INVALID_CREDENTIALS';
  const REFUSAL_MESSAGE = 'Invalid email or password.';
  const refusedBody = { statusCode: 401, code: REFUSAL_CODE, message: REFUSAL_MESSAGE };

  it('should return UnauthorizedError with the remote code and message when the 401 code is a refusal code', () => {
    const error = toFailureError(clientFailure(HttpStatus.UNAUTHORIZED, refusedBody), CAUSE, [
      REFUSAL_CODE,
    ]);

    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error).toMatchObject({ code: REFUSAL_CODE, message: REFUSAL_MESSAGE });
    expect(error.cause).toBe(CAUSE);
  });

  it('should return DependencyUnavailableError when the 401 code is not one of the refusal codes', () => {
    const error = toFailureError(
      clientFailure(HttpStatus.UNAUTHORIZED, {
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Unauthorized',
      }),
      CAUSE,
      [REFUSAL_CODE],
    );

    expect(error).toBeInstanceOf(DependencyUnavailableError);
  });

  it('should return DependencyUnavailableError when the 401 body is not an error response', () => {
    const error = toFailureError(clientFailure(HttpStatus.UNAUTHORIZED, 'Unauthorized'), CAUSE, [
      REFUSAL_CODE,
    ]);

    expect(error).toBeInstanceOf(DependencyUnavailableError);
  });

  it('should return DependencyUnavailableError when no refusal codes are given', () => {
    const error = toFailureError(clientFailure(HttpStatus.UNAUTHORIZED, refusedBody), CAUSE);

    expect(error).toBeInstanceOf(DependencyUnavailableError);
  });
});
