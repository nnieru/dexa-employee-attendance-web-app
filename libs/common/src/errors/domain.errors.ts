/** What went wrong. The HTTP status follows from the kind; clients act on the code. */
export type DomainErrorKind =
  | 'not_found'
  | 'conflict'
  | 'validation'
  | 'forbidden'
  | 'unauthorized'
  | 'dependency_unavailable'
  | 'payload_too_large';

/**
 * Facts a client needs to act on a failure, such as an operation ID and the phase that was saved. Only
 * identifiers and phase names belong here: the details are sent to clients as they are.
 */
export type DomainErrorDetails = Readonly<Record<string, unknown>>;

export type DomainErrorOptions = ErrorOptions & {
  readonly details?: DomainErrorDetails;
};

/**
 * Business code throws these instead of HTTP exceptions, so domain logic stays independent of the
 * transport. The code is required so every failure carries a specific, documented identifier; use
 * the generic `ErrorCode` values only when nothing more specific applies. The message is sent to
 * clients as-is, so it must never contain internal detail.
 */
export abstract class DomainError extends Error {
  abstract readonly kind: DomainErrorKind;
  readonly code: string;
  // Undefined unless the failure has details, so the response omits the field for every other error.
  readonly details: DomainErrorDetails | undefined;

  constructor(code: string, message: string, options?: DomainErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
    this.details = options?.details;
  }
}

export class NotFoundError extends DomainError {
  readonly kind = 'not_found';
}

export class ConflictError extends DomainError {
  readonly kind = 'conflict';
}

export class ValidationError extends DomainError {
  readonly kind = 'validation';
}

export class ForbiddenError extends DomainError {
  readonly kind = 'forbidden';
}

export class UnauthorizedError extends DomainError {
  readonly kind = 'unauthorized';
}

export class DependencyUnavailableError extends DomainError {
  readonly kind = 'dependency_unavailable';
}

// Refused before the body is buffered, so the message can name the limit without leaking anything.
export class PayloadTooLargeError extends DomainError {
  readonly kind = 'payload_too_large';
}
