import { HttpStatus } from '@nestjs/common';
import type { DomainErrorKind } from './domain.errors.js';

/** Every kind needs a status here; the Record type turns a missing kind into a compile error. */
export const DOMAIN_ERROR_STATUS: Readonly<Record<DomainErrorKind, HttpStatus>> = {
  not_found: HttpStatus.NOT_FOUND,
  conflict: HttpStatus.CONFLICT,
  validation: HttpStatus.BAD_REQUEST,
  forbidden: HttpStatus.FORBIDDEN,
  unauthorized: HttpStatus.UNAUTHORIZED,
  dependency_unavailable: HttpStatus.SERVICE_UNAVAILABLE,
  payload_too_large: HttpStatus.PAYLOAD_TOO_LARGE,
};
