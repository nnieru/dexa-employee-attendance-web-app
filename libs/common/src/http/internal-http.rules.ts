import { HttpStatus } from '@nestjs/common';
import { ErrorCode, errorResponseSchema } from '@dexa/contracts';
import {
  ConflictError,
  DependencyUnavailableError,
  ForbiddenError,
  NotFoundError,
  PayloadTooLargeError,
  UnauthorizedError,
  ValidationError,
  type DomainError,
  type DomainErrorOptions,
} from '../errors/domain.errors.js';

export type InternalHttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/**
 * Why one attempt produced no usable answer. A timeout and a refused connection are both
 * no_response.
 */
export type AttemptFailure =
  | { readonly kind: 'no_response' }
  // remoteBody is kept only for a 5xx answer that the target may define a code for (see toFailureError).
  | { readonly kind: 'server_error'; readonly status: number; readonly remoteBody?: unknown }
  | { readonly kind: 'client_error'; readonly status: number; readonly remoteBody: unknown }
  | { readonly kind: 'unexpected_status'; readonly status: number };

// Retries after the first attempt, so a GET makes at most three calls in total.
export const MAX_GET_RETRIES = 2;

export const DEPENDENCY_UNAVAILABLE_MESSAGE =
  'A dependent service is unavailable. Try again shortly.';

const CLIENT_ERROR_CLASS = 4;
const SERVER_ERROR_CLASS = 5;
const STATUS_CLASS_DIVISOR = 100;

type ClientErrorMapping = {
  readonly errorClass: new (
    code: string,
    message: string,
    options: DomainErrorOptions,
  ) => DomainError;
  readonly fallbackCode: string;
  readonly fallbackMessage: string;
};

// Only these statuses have a client-facing error. Any other 4xx means this service's request does
// not match the dependency's contract, so it is reported as unavailable rather than blamed on the
// caller. 401 is handled by toRefusalError: it is not mapped here, because by default it means this
// service's own token was refused, which is a misconfiguration.
const CLIENT_ERROR_MAPPING: Readonly<Partial<Record<number, ClientErrorMapping>>> = {
  [HttpStatus.BAD_REQUEST]: {
    errorClass: ValidationError,
    fallbackCode: ErrorCode.VALIDATION_FAILED,
    fallbackMessage: 'The request is invalid.',
  },
  [HttpStatus.FORBIDDEN]: {
    errorClass: ForbiddenError,
    fallbackCode: ErrorCode.FORBIDDEN,
    fallbackMessage: 'This action is not permitted.',
  },
  [HttpStatus.NOT_FOUND]: {
    errorClass: NotFoundError,
    fallbackCode: ErrorCode.NOT_FOUND,
    fallbackMessage: 'The requested item was not found.',
  },
  [HttpStatus.CONFLICT]: {
    errorClass: ConflictError,
    fallbackCode: ErrorCode.CONFLICT,
    fallbackMessage: 'The request conflicts with the current state.',
  },
  [HttpStatus.PAYLOAD_TOO_LARGE]: {
    errorClass: PayloadTooLargeError,
    fallbackCode: ErrorCode.PAYLOAD_TOO_LARGE,
    fallbackMessage: 'The payload is too large.',
  },
};

/**
 * Only GET is retried, because a POST, PATCH, or PUT may already have changed state when its answer was lost.
 * A GET is retried only when no response arrived or the answer was 5xx.
 * @param attempt the number of attempts made so far, including the one that failed.
 */
export function shouldRetry(
  method: InternalHttpMethod,
  failure: AttemptFailure,
  attempt: number,
): boolean {
  const isTransientFailure = failure.kind === 'no_response' || failure.kind === 'server_error';
  return method === 'GET' && isTransientFailure && attempt <= MAX_GET_RETRIES;
}

export function classifyStatus(status: number, remoteBody: unknown): AttemptFailure {
  const statusClass = Math.floor(status / STATUS_CLASS_DIVISOR);
  if (statusClass === SERVER_ERROR_CLASS) return { kind: 'server_error', status };
  if (statusClass === CLIENT_ERROR_CLASS) return { kind: 'client_error', status, remoteBody };
  return { kind: 'unexpected_status', status };
}

export function createDependencyUnavailableError(cause?: unknown): DependencyUnavailableError {
  return new DependencyUnavailableError(
    ErrorCode.DEPENDENCY_UNAVAILABLE,
    DEPENDENCY_UNAVAILABLE_MESSAGE,
    { cause },
  );
}

/**
 * The error that callers receive for a failed attempt. The cause stays internal, never sent.
 * @param refusalCodes the codes that make a 401 answer a refusal of the call's own credentials.
 * @param passThroughErrorCodes the codes that make a 503 answer a known outcome of the call, such as a partial
 * provisioning failure, which reaches the caller with its code, message, and details.
 */
export function toFailureError(
  failure: AttemptFailure,
  cause: unknown,
  refusalCodes: ReadonlyArray<string> = [],
  passThroughErrorCodes: ReadonlyArray<string> = [],
): DomainError {
  if (failure.kind === 'server_error') {
    return toPassThroughError(failure, passThroughErrorCodes, cause);
  }
  if (failure.kind !== 'client_error') return createDependencyUnavailableError(cause);
  if (failure.status === HttpStatus.UNAUTHORIZED) {
    return toRefusalError(failure.remoteBody, refusalCodes, cause);
  }
  return toClientError(failure.status, failure.remoteBody, cause);
}

export function describeFailure(failure: AttemptFailure): string {
  return failure.kind === 'no_response' ? 'no response' : `HTTP ${failure.status}`;
}

// Only a 503 that carries one of the call's pass-through codes reaches the caller. Any other 5xx answer stays
// generic, because its body is not written for clients.
function toPassThroughError(
  failure: { readonly status: number; readonly remoteBody?: unknown },
  passThroughErrorCodes: ReadonlyArray<string>,
  cause: unknown,
): DomainError {
  const remoteError = errorResponseSchema.safeParse(failure.remoteBody);
  if (
    failure.status !== HttpStatus.SERVICE_UNAVAILABLE ||
    !remoteError.success ||
    !passThroughErrorCodes.includes(remoteError.data.code)
  ) {
    return createDependencyUnavailableError(cause);
  }
  return new DependencyUnavailableError(remoteError.data.code, remoteError.data.message, {
    cause,
    details: remoteError.data.details,
  });
}

// A 401 is a refusal of the caller's credentials only when the call names the code in the answer.
// Otherwise it is this service's own token being refused, which must not reach the client as a session
// problem.
function toRefusalError(
  remoteBody: unknown,
  refusalCodes: ReadonlyArray<string>,
  cause: unknown,
): DomainError {
  const remoteError = errorResponseSchema.safeParse(remoteBody);
  if (!remoteError.success || !refusalCodes.includes(remoteError.data.code)) {
    return createDependencyUnavailableError(cause);
  }
  return new UnauthorizedError(remoteError.data.code, remoteError.data.message, {
    cause,
    details: remoteError.data.details,
  });
}

function toClientError(status: number, remoteBody: unknown, cause: unknown): DomainError {
  const mapping = CLIENT_ERROR_MAPPING[status];
  if (mapping === undefined) return createDependencyUnavailableError(cause);

  // The remote code and message are passed on only when the body has the shared error shape.
  const remoteError = errorResponseSchema.safeParse(remoteBody);
  if (!remoteError.success) {
    return new mapping.errorClass(mapping.fallbackCode, mapping.fallbackMessage, { cause });
  }
  return new mapping.errorClass(remoteError.data.code, remoteError.data.message, {
    cause,
    details: remoteError.data.details,
  });
}
