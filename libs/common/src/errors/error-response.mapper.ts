import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, type ErrorResponse } from '@dexa/contracts';
import { DOMAIN_ERROR_STATUS } from './domain-error-status.js';
import { DomainError } from './domain.errors.js';
import { isRecord } from './is-record.js';

export const UNEXPECTED_ERROR_MESSAGE = 'An unexpected error occurred.';

const MESSAGE_SEPARATOR = '; ';

// Clients branch on these codes. Other client statuses report INTERNAL_ERROR.
const CODE_BY_CLIENT_STATUS: Readonly<Partial<Record<number, string>>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.VALIDATION_FAILED,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
};

/**
 * Builds the response body for any thrown value. Only domain errors and client-side HTTP errors
 * expose their message; every other failure gets the generic message.
 */
export function toErrorResponse(exception: unknown): ErrorResponse {
  if (exception instanceof DomainError) {
    return toDomainErrorResponse(exception);
  }
  if (exception instanceof HttpException) {
    return mapHttpException(exception);
  }
  return mapExposedClientError(exception) ?? createUnexpectedErrorResponse();
}

// Details are added only when the error carries them, so every other response keeps its three fields.
function toDomainErrorResponse(error: DomainError): ErrorResponse {
  const response: ErrorResponse = {
    statusCode: DOMAIN_ERROR_STATUS[error.kind],
    code: error.code,
    message: error.message,
  };
  return error.details === undefined ? response : { ...response, details: error.details };
}

function mapHttpException(exception: HttpException): ErrorResponse {
  const statusCode = exception.getStatus();
  const body = exception.getResponse();
  const code = readBodyCode(body) ?? deriveCodeForStatus(statusCode);
  // Developer-written server-error messages may name internal hosts, so clients never receive them.
  if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
    return { statusCode, code, message: UNEXPECTED_ERROR_MESSAGE };
  }
  return { statusCode, code, message: readBodyMessage(body) ?? exception.message };
}

// Body parsers reject malformed JSON with a 4xx status and mark the message safe to show. Treating
// them as unexpected errors would answer a client mistake with 500 and page operators for it.
function mapExposedClientError(exception: unknown): ErrorResponse | undefined {
  if (!(exception instanceof Error) || !isRecord(exception)) return undefined;
  const statusCode = exception.statusCode;
  if (exception.expose !== true || !isClientStatus(statusCode)) return undefined;
  return { statusCode, code: deriveCodeForStatus(statusCode), message: exception.message };
}

function createUnexpectedErrorResponse(): ErrorResponse {
  return {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    code: ErrorCode.INTERNAL_ERROR,
    message: UNEXPECTED_ERROR_MESSAGE,
  };
}

function readBodyCode(body: unknown): string | undefined {
  if (!isRecord(body) || typeof body.code !== 'string') return undefined;
  return body.code;
}

function readBodyMessage(body: unknown): string | undefined {
  if (typeof body === 'string') return body;
  if (!isRecord(body)) return undefined;
  if (typeof body.message === 'string') return body.message;
  if (isStringArray(body.message)) return body.message.join(MESSAGE_SEPARATOR);
  return undefined;
}

function deriveCodeForStatus(statusCode: number): string {
  return CODE_BY_CLIENT_STATUS[statusCode] ?? ErrorCode.INTERNAL_ERROR;
}

function isClientStatus(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 400 && value < 500;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
