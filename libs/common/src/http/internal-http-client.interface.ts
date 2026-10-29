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
};

export type InternalGetRequest<TResponse> = InternalRequest<TResponse> & {
  readonly query?: Readonly<Record<string, string>>;
};

export type InternalPostRequest<TResponse> = InternalRequest<TResponse> & {
  readonly body: unknown;
};
