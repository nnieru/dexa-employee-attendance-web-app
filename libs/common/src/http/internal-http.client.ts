import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { isAxiosError, type AxiosError, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { setTimeout as delay } from 'node:timers/promises';
import { firstValueFrom } from 'rxjs';
import type { z } from 'zod';
import type { ServiceName } from '../auth/service-name.js';
import {
  SERVICE_TOKEN_SIGNER,
  type IServiceTokenSigner,
} from '../auth/service-token-signer.interface.js';
import type { DomainError } from '../errors/domain.errors.js';
import { CORRELATION_ID_HEADER } from './correlation-id-header.js';
import type {
  IInternalHttpClient,
  InternalGetRequest,
  InternalPostRequest,
} from './internal-http-client.interface.js';
import {
  classifyStatus,
  createDependencyUnavailableError,
  describeFailure,
  shouldRetry,
  toFailureError,
  type AttemptFailure,
  type InternalHttpMethod,
} from './internal-http.rules.js';
import type { InternalServiceBaseUrls } from './internal-service-base-urls.schema.js';
import { INTERNAL_SERVICE_BASE_URLS } from './internal-service-base-urls.token.js';

const DEFAULT_TIMEOUT_MILLISECONDS = 3000;
const RETRY_BACKOFF_MILLISECONDS = 200;
// Bounds the memory that one answer can take. Paginated responses stay far below this.
const MAX_RESPONSE_BYTES = 1_048_576;

// Everything one call needs. The public methods build it, and each attempt sends it.
type InternalCall<TResponse> = {
  readonly method: InternalHttpMethod;
  readonly target: ServiceName;
  readonly path: string;
  readonly responseSchema: z.ZodType<TResponse>;
  readonly query?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly correlationId?: string;
  readonly timeoutMilliseconds?: number;
};

type CallIdentity = Pick<InternalCall<unknown>, 'method' | 'path' | 'target' | 'correlationId'>;

/**
 * The helper that every I*Client composes with. It signs each attempt for the target, bounds every
 * call with a timeout, retries only idempotent GETs, and turns each failure into a domain error.
 * Feature clients contribute only their routes and response schemas.
 */
@Injectable()
export class InternalHttpClient implements IInternalHttpClient {
  private readonly logger = new Logger(InternalHttpClient.name);

  constructor(
    private readonly httpService: HttpService,
    @Inject(SERVICE_TOKEN_SIGNER) private readonly tokenSigner: IServiceTokenSigner,
    @Inject(INTERNAL_SERVICE_BASE_URLS) private readonly serviceBaseUrls: InternalServiceBaseUrls,
  ) {}

  get<TResponse>(request: InternalGetRequest<TResponse>): Promise<TResponse> {
    return this.send({ ...request, method: 'GET' });
  }

  post<TResponse>(request: InternalPostRequest<TResponse>): Promise<TResponse> {
    return this.send({ ...request, method: 'POST' });
  }

  private async send<TResponse>(call: InternalCall<TResponse>): Promise<TResponse> {
    const response = await this.sendAttempt(call, 1);
    return this.parseBody(response.data, call);
  }

  // attempt counts the attempts made so far, starting at 1.
  private async sendAttempt<TResponse>(
    call: InternalCall<TResponse>,
    attempt: number,
  ): Promise<AxiosResponse<unknown>> {
    const config = await this.buildRequestConfig(call);
    try {
      return await firstValueFrom(this.httpService.request<unknown>(config));
    } catch (error: unknown) {
      // Only an axios failure describes the dependency. Anything else is a defect here or in axios,
      // so it propagates unchanged.
      if (!isAxiosError(error)) throw error;
      const failure = describeAxiosFailure(error);
      if (!shouldRetry(call.method, failure, attempt)) {
        throw this.toCallError(call, failure, error);
      }
      const reason = describeFailure(failure);
      this.logger.warn(`Retrying ${describeCall(call)}: attempt ${attempt} failed with ${reason}.`);
      await delay(RETRY_BACKOFF_MILLISECONDS);
      return this.sendAttempt(call, attempt + 1);
    }
  }

  private parseBody<TResponse>(body: unknown, call: InternalCall<TResponse>): TResponse {
    const parsed = call.responseSchema.safeParse(body);
    if (parsed.success) return parsed.data;
    // The body stays out of the log, because it can hold personal data.
    this.logger.error(`${describeCall(call)} answered with a body that does not match its schema.`);
    throw createDependencyUnavailableError();
  }

  private toCallError(call: CallIdentity, failure: AttemptFailure, cause: unknown): DomainError {
    const error = toFailureError(failure, cause);
    if (error.kind === 'dependency_unavailable') {
      this.logger.error(`${describeCall(call)} failed: ${describeFailure(failure)}.`);
    }
    return error;
  }

  // Built per attempt: each attempt gets a fresh token and its own deadline, so a retry is not
  // cut short by the timeout of the attempt before it.
  private async buildRequestConfig<TResponse>(
    call: InternalCall<TResponse>,
  ): Promise<AxiosRequestConfig> {
    const baseUrl = this.resolveBaseUrl(call.target);
    const token = await this.tokenSigner.signFor(call.target);
    const timeout = call.timeoutMilliseconds ?? DEFAULT_TIMEOUT_MILLISECONDS;
    return {
      method: call.method,
      baseURL: baseUrl,
      url: call.path,
      params: call.query,
      data: call.body,
      headers: buildHeaders(token, call.correlationId),
      timeout,
      // axios's timeout covers only the connection and socket idle time, so a slow body could
      // outlast it. The signal bounds the whole attempt.
      signal: AbortSignal.timeout(timeout),
      // The service token must not follow a redirect to another host, nor pass through a proxy
      // taken from the environment.
      maxRedirects: 0,
      proxy: false,
      maxContentLength: MAX_RESPONSE_BYTES,
    };
  }

  private resolveBaseUrl(target: ServiceName): string {
    const baseUrl = this.serviceBaseUrls[target];
    // A missing URL is a wiring defect in the calling service, so it fails as a defect rather than
    // looking like an outage of the dependency.
    if (baseUrl === undefined) {
      throw new Error(`No internal base URL is configured for ${target}.`);
    }
    return baseUrl;
  }
}

function buildHeaders(token: string, correlationId: string | undefined): Record<string, string> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (correlationId !== undefined) headers[CORRELATION_ID_HEADER] = correlationId;
  return headers;
}

// A response that never arrived (timeout, refused connection, reset) has no status to classify.
function describeAxiosFailure(error: AxiosError): AttemptFailure {
  const response = error.response;
  if (response === undefined) return { kind: 'no_response' };
  return classifyStatus(response.status, response.data);
}

// Logs carry the method, path, and target, never the query, the body, or the token.
function describeCall(call: CallIdentity): string {
  const correlation =
    call.correlationId === undefined ? '' : ` (correlationId=${call.correlationId})`;
  return `${call.method} ${call.path} on ${call.target}${correlation}`;
}
