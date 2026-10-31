import type { z } from 'zod';
import type { AuthenticatedUser } from '../auth/authenticated-principal.js';
import type { ServiceName } from '../auth/service-name.js';

/**
 * Calls another service's internal routes. Each call carries a service token addressed to the
 * target, is bounded by a timeout, and resolves only to a body that matched its response schema.
 */
export interface IInternalHttpClient {
  get<TResponse>(request: InternalGetRequest<TResponse>): Promise<TResponse>;
  getBinary(request: InternalBinaryGetRequest): Promise<InternalBinaryResponse>;
  post<TResponse>(request: InternalPostRequest<TResponse>): Promise<TResponse>;
  patch<TResponse>(request: InternalPatchRequest<TResponse>): Promise<TResponse>;
  putJson<TResponse>(request: InternalJsonPutRequest<TResponse>): Promise<TResponse>;
  delete<TResponse>(request: InternalDeleteRequest<TResponse>): Promise<TResponse>;
  put<TResponse>(request: InternalMultipartPutRequest<TResponse>): Promise<TResponse>;
}

export const INTERNAL_HTTP_CLIENT = Symbol('IInternalHttpClient');

type InternalRequestTarget = {
  readonly target: ServiceName;
  // The route below the service root, such as /api/v1/internal/accounts. axios does not encode
  // this string, so encode path parameters with encodeURIComponent before passing them in.
  readonly path: string;
  readonly correlationId?: string;
  readonly timeoutMilliseconds?: number;
  // The end user that api-gateway acts for. The call still carries this service's token, which also names the
  // user, so the target authorizes the same person without ever seeing the user's JWT (D-51). Only api-gateway
  // may set it: the signer refuses any other service.
  readonly onBehalfOf?: AuthenticatedUser;
  // Codes that a 401 answer carries when the target refused the credentials this call presents. Such
  // an answer reaches the caller as an UnauthorizedError with the target's code and message. Any other
  // 401 means a token was refused, a misconfiguration, so it stays a dependency failure. Never name
  // UNAUTHORIZED here: the target uses that code when it refuses the token this service sends, and
  // that refusal is never the caller's fault.
  readonly refusalCodes?: ReadonlyArray<string>;
  // Codes that a 503 answer carries when the target reports an outcome that it defines for this call, such as a
  // partial provisioning failure. Such an answer reaches the caller with the code, message, and details. Any
  // other 5xx answer stays a generic dependency failure.
  readonly passThroughErrorCodes?: ReadonlyArray<string>;
};

type InternalRequest<TResponse> = InternalRequestTarget & {
  readonly responseSchema: z.ZodType<TResponse>;
};

export type InternalGetRequest<TResponse> = InternalRequest<TResponse> & {
  readonly query?: Readonly<Record<string, string>>;
};

export type InternalPostRequest<TResponse> = InternalRequest<TResponse> & {
  readonly body: unknown;
};

// A PATCH is never retried, like a POST: the target may have applied the change when the answer was lost.
// A 204 answer has no body, so its response schema accepts undefined (z.void()).
export type InternalPatchRequest<TResponse> = InternalRequest<TResponse> & {
  readonly body: unknown;
};

// A DELETE has no body and is never retried: the target may have removed the row when the answer was lost. A 204
// answer has no body, so its response schema accepts undefined (z.void()).
export type InternalDeleteRequest<TResponse> = InternalRequest<TResponse>;

// A PUT with a JSON body is never retried either: the target may have applied it when the answer was lost.
export type InternalJsonPutRequest<TResponse> = InternalRequest<TResponse> & {
  readonly body: unknown;
};

/** One file sent as a multipart/form-data part. The caller bounds its size before it reaches the client. */
export type InternalMultipartFile = {
  readonly fieldName: string;
  readonly fileName: string;
  readonly contentType?: string;
  readonly content: Buffer;
};

// A PUT with a multipart body is never retried, for the same reason as a POST.
export type InternalMultipartPutRequest<TResponse> = InternalRequest<TResponse> & {
  readonly file: InternalMultipartFile;
};

// A binary GET has no schema to check. The caller checks what the bytes mean.
export type InternalBinaryGetRequest = InternalRequestTarget;

export type InternalBinaryResponse = {
  readonly contentType: string;
  readonly body: Buffer;
};
