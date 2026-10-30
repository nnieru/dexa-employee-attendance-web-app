import type { z } from 'zod';
import type { ServiceName } from '../auth/service-name.js';

/**
 * Calls another service's internal routes. Each call carries a service token addressed to the
 * target, is bounded by a timeout, and resolves only to a body that matched its response schema.
 */
export interface IInternalHttpClient {
  get<TResponse>(request: InternalGetRequest<TResponse>): Promise<TResponse>;
  post<TResponse>(request: InternalPostRequest<TResponse>): Promise<TResponse>;
}

export const INTERNAL_HTTP_CLIENT = Symbol('IInternalHttpClient');

type InternalRequest<TResponse> = {
  readonly target: ServiceName;
  // The route below the service root, such as /api/v1/internal/accounts. axios does not encode
  // this string, so encode path parameters with encodeURIComponent before passing them in.
  readonly path: string;
  readonly responseSchema: z.ZodType<TResponse>;
  readonly correlationId?: string;
  readonly timeoutMilliseconds?: number;
  // The end user's token. When set, it replaces this service's token as the bearer credential, so the
  // target authorizes the user (ARCHITECTURE §5).
  readonly forwardedUserToken?: string;
  // Codes that a 401 answer carries when the target refused the credentials this call presents. Such
  // an answer reaches the caller as an UnauthorizedError with the target's code and message. Any other
  // 401 means this service's own token was refused, a misconfiguration, so it stays a dependency
  // failure. Never name UNAUTHORIZED for a call that sends this service's token: the target uses that
  // code when it refuses the service token.
  readonly refusalCodes?: ReadonlyArray<string>;
};

export type InternalGetRequest<TResponse> = InternalRequest<TResponse> & {
  readonly query?: Readonly<Record<string, string>>;
};

export type InternalPostRequest<TResponse> = InternalRequest<TResponse> & {
  readonly body: unknown;
};
