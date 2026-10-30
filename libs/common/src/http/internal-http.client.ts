import { HttpService } from '@nestjs/axios';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
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
  InternalBinaryGetRequest,
  InternalBinaryResponse,
  InternalGetRequest,
  InternalMultipartFile,
  InternalMultipartPutRequest,
  InternalPatchRequest,
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
const DEFAULT_PART_CONTENT_TYPE = 'application/octet-stream';
// Bounds the memory that one answer can take. Paginated responses stay far below this.
const MAX_RESPONSE_BYTES = 1_048_576;
// A stored photo is a JPEG of at most 1024 by 1024 pixels, far below this bound. The bound only stops a runaway answer.
const MAX_BINARY_RESPONSE_BYTES = 6 * 1_048_576;

// How an answer is read. A JSON answer is parsed and checked against a schema; a binary answer is kept as bytes.
type ResponseKind = 'json' | 'bytes';

const RESPONSE_LIMITS: Readonly<
  Record<ResponseKind, { readonly responseType?: 'arraybuffer'; readonly maxContentLength: number }>
> = {
  json: { maxContentLength: MAX_RESPONSE_BYTES },
  bytes: { responseType: 'arraybuffer', maxContentLength: MAX_BINARY_RESPONSE_BYTES },
};

// Everything one call needs. The public methods build it, and each attempt sends it.
type InternalCall = {
  readonly method: InternalHttpMethod;
  readonly target: ServiceName;
  readonly path: string;
  readonly responseKind: ResponseKind;
  readonly query?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly correlationId?: string;
  readonly timeoutMilliseconds?: number;
  readonly forwardedUserToken?: string;
  readonly refusalCodes?: ReadonlyArray<string>;
  readonly passThroughErrorCodes?: ReadonlyArray<string>;
};

// A JSON call also names the schema that the answer must match.
type JsonCall<TResponse> = InternalCall & {
  readonly responseSchema: z.ZodType<TResponse>;
};

// What logs and error mapping need to know about a call. It never includes the body, query, or token.
type CallSummary = Pick<
  InternalCall,
  'method' | 'path' | 'target' | 'correlationId' | 'refusalCodes' | 'passThroughErrorCodes'
>;

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
    return this.sendJson({ ...request, method: 'GET', responseKind: 'json' });
  }

  getBinary(request: InternalBinaryGetRequest): Promise<InternalBinaryResponse> {
    return this.sendBinary({ ...request, method: 'GET', responseKind: 'bytes' });
  }

  post<TResponse>(request: InternalPostRequest<TResponse>): Promise<TResponse> {
    return this.sendJson({ ...request, method: 'POST', responseKind: 'json' });
  }

  patch<TResponse>(request: InternalPatchRequest<TResponse>): Promise<TResponse> {
    return this.sendJson({ ...request, method: 'PATCH', responseKind: 'json' });
  }

  put<TResponse>(request: InternalMultipartPutRequest<TResponse>): Promise<TResponse> {
    return this.sendJson({
      target: request.target,
      path: request.path,
      responseSchema: request.responseSchema,
      body: buildMultipartBody(request.file),
      correlationId: request.correlationId,
      timeoutMilliseconds: request.timeoutMilliseconds,
      forwardedUserToken: request.forwardedUserToken,
      refusalCodes: request.refusalCodes,
      passThroughErrorCodes: request.passThroughErrorCodes,
      method: 'PUT',
      responseKind: 'json',
    });
  }

  private async sendJson<TResponse>(call: JsonCall<TResponse>): Promise<TResponse> {
    const response = await this.sendAttempt(call, 1);
    // axios reports a 204 body as an empty string, which is not the empty answer the call means.
    const body = response.status === HttpStatus.NO_CONTENT ? undefined : response.data;
    return this.parseBody(body, call);
  }

  private async sendBinary(call: InternalCall): Promise<InternalBinaryResponse> {
    const response = await this.sendAttempt(call, 1);
    const contentType = response.headers['content-type'];
    if (typeof contentType !== 'string' || !Buffer.isBuffer(response.data)) {
      this.logger.error(`${describeCall(call)} answered without a binary body and content type.`);
      throw createDependencyUnavailableError();
    }
    return { contentType, body: response.data };
  }

  // attempt counts the attempts made so far, starting at 1.
  private async sendAttempt(call: InternalCall, attempt: number): Promise<AxiosResponse<unknown>> {
    const config = await this.buildRequestConfig(call);
    try {
      return await firstValueFrom(this.httpService.request<unknown>(config));
    } catch (error: unknown) {
      // Only an axios failure describes the dependency. Anything else is a defect here or in axios,
      // so it propagates unchanged.
      if (!isAxiosError(error)) throw error;
      const failure = describeAxiosFailure(error);
      if (!shouldRetry(call.method, failure, attempt)) {
        throw this.toCallError(call, failure, toSafeCause(error));
      }
      const reason = describeFailure(failure);
      this.logger.warn(`Retrying ${describeCall(call)}: attempt ${attempt} failed with ${reason}.`);
      await delay(RETRY_BACKOFF_MILLISECONDS);
      return this.sendAttempt(call, attempt + 1);
    }
  }

  private parseBody<TResponse>(body: unknown, call: JsonCall<TResponse>): TResponse {
    const parsed = call.responseSchema.safeParse(body);
    if (parsed.success) return parsed.data;
    // The body stays out of the log, because it can hold personal data.
    this.logger.error(`${describeCall(call)} answered with a body that does not match its schema.`);
    throw createDependencyUnavailableError();
  }

  private toCallError(call: CallSummary, failure: AttemptFailure, cause: unknown): DomainError {
    const error = toFailureError(failure, cause, call.refusalCodes, call.passThroughErrorCodes);
    if (error.kind === 'dependency_unavailable') {
      this.logger.error(`${describeCall(call)} failed: ${describeFailure(failure)}.`);
    }
    return error;
  }

  // Built per attempt: each attempt gets a fresh token and its own deadline, so a retry is not
  // cut short by the timeout of the attempt before it.
  private async buildRequestConfig(call: InternalCall): Promise<AxiosRequestConfig> {
    const baseUrl = this.resolveBaseUrl(call.target);
    // A forwarded user token replaces the service token, so the target authorizes the user and this
    // service signs nothing for the call.
    const credential = call.forwardedUserToken ?? (await this.tokenSigner.signFor(call.target));
    const timeout = call.timeoutMilliseconds ?? DEFAULT_TIMEOUT_MILLISECONDS;
    const limits = RESPONSE_LIMITS[call.responseKind];
    return {
      method: call.method,
      baseURL: baseUrl,
      url: call.path,
      params: call.query,
      data: call.body,
      headers: buildHeaders(credential, call.correlationId),
      responseType: limits.responseType,
      timeout,
      // axios's timeout covers only the connection and socket idle time, so a slow body could
      // outlast it. The signal bounds the whole attempt.
      signal: AbortSignal.timeout(timeout),
      // The service token must not follow a redirect to another host, nor pass through a proxy
      // taken from the environment.
      maxRedirects: 0,
      proxy: false,
      maxContentLength: limits.maxContentLength,
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

function buildHeaders(
  credential: string,
  correlationId: string | undefined,
): Record<string, string> {
  const headers: Record<string, string> = { Authorization: `Bearer ${credential}` };
  if (correlationId !== undefined) headers[CORRELATION_ID_HEADER] = correlationId;
  return headers;
}

// An AxiosError carries its request config, which holds the bearer token and the request body (an initial
// password, for example). The cause kept on the domain error names only the failure, so a later log of the
// cause cannot leak either.
function toSafeCause(error: AxiosError): Error {
  const status = error.response?.status;
  const cause = new Error(
    status === undefined
      ? `Internal call failed with ${error.code ?? 'no response'}.`
      : `Internal call answered with HTTP ${status}.`,
  );
  cause.name = 'InternalHttpCallError';
  return cause;
}

// A response that never arrived (timeout, refused connection, reset) has no status to classify.
function describeAxiosFailure(error: AxiosError): AttemptFailure {
  const response = error.response;
  if (response === undefined) return { kind: 'no_response' };
  const remoteBody = readRemoteErrorBody(response.data);
  const failure = classifyStatus(response.status, remoteBody);
  // A 5xx body is kept only for the pass-through check, which reads it when a call names its code.
  return failure.kind === 'server_error' ? { ...failure, remoteBody } : failure;
}

// A binary call receives its error body as bytes, so the JSON error shape is parsed back here. A body that
// is not JSON stays unreadable, and the error maps to the generic message for its status.
function readRemoteErrorBody(data: unknown): unknown {
  if (!Buffer.isBuffer(data)) return data;
  try {
    const parsed: unknown = JSON.parse(data.toString('utf8'));
    return parsed;
  } catch {
    return undefined;
  }
}

// The file is sent as the spec-compliant FormData that axios streams. The part's type is generic when the caller
// does not know it, because the target decides what the bytes are from their content.
function buildMultipartBody(file: InternalMultipartFile): FormData {
  const form = new FormData();
  // Blob takes an ArrayBuffer-backed view, so the bytes are copied once into one; a photo is at most 5 MiB.
  const content = new Blob([new Uint8Array(file.content)], {
    type: file.contentType ?? DEFAULT_PART_CONTENT_TYPE,
  });
  form.append(file.fieldName, content, file.fileName);
  return form;
}

// Logs carry the method, path, and target, never the query, the body, or the token.
function describeCall(call: CallSummary): string {
  const correlation =
    call.correlationId === undefined ? '' : ` (correlationId=${call.correlationId})`;
  return `${call.method} ${call.path} on ${call.target}${correlation}`;
}
