import { randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import {
  Catch,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { ErrorResponse } from '@dexa/contracts';
import { CORRELATION_ID_HEADER } from '../http/correlation-id-header.js';
import { toErrorResponse } from './error-response.mapper.js';

const MAX_CORRELATION_ID_LENGTH = 100;

// Declared locally so libs/common does not take a dependency on express types.
type ErrorHttpRequest = { readonly headers: IncomingHttpHeaders };

type ErrorHttpResponse = {
  readonly headersSent: boolean;
  end(): void;
  setHeader(name: string, value: string): void;
  status(statusCode: number): { json(body: ErrorResponse): void };
};

/**
 * The one exception filter every service uses. Responses share the { statusCode, code, message }
 * shape, and server errors are logged with the correlation ID so they can be traced.
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter<unknown> {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<ErrorHttpRequest>();
    const response = http.getResponse<ErrorHttpResponse>();
    const correlationId = readCorrelationId(request.headers) ?? randomUUID();
    const body = toErrorResponse(exception);

    if (body.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logServerError(exception, body.statusCode, correlationId);
    }
    // Writing a body after headers were sent throws, so the response is closed instead. This
    // matches Nest's default filter and covers errors raised after an SSE stream has started.
    if (response.headersSent) {
      response.end();
      return;
    }
    response.setHeader(CORRELATION_ID_HEADER, correlationId);
    response.status(body.statusCode).json(body);
  }

  private logServerError(exception: unknown, statusCode: number, correlationId: string): void {
    const { name, stack } = describeException(exception);
    this.logger.error(
      `${name} answered with HTTP ${statusCode} (correlationId=${correlationId})`,
      stack,
    );
  }
}

function readCorrelationId(headers: IncomingHttpHeaders): string | undefined {
  const value = headers[CORRELATION_ID_HEADER];
  if (typeof value !== 'string') return undefined;
  return value.length > 0 && value.length <= MAX_CORRELATION_ID_LENGTH ? value : undefined;
}

// Only the name and stack are logged. The stack carries the error's own message, so secrets must
// never be put into error messages.
function describeException(exception: unknown): { name: string; stack: string | undefined } {
  if (exception instanceof Error) return { name: exception.name, stack: exception.stack };
  return { name: `non-Error value of type ${typeof exception}`, stack: undefined };
}
