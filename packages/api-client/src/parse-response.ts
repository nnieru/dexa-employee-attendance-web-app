import type { ZodType } from 'zod';

export const INVALID_RESPONSE_MESSAGE = 'The server sent an unexpected response. Try again.';

/**
 * The server answered successfully but the body does not match the contract. The message is fixed:
 * the zod issues are kept only as `cause` for internal logging, because they can echo received values.
 */
export class InvalidResponseError extends Error {
  constructor(cause: unknown) {
    super(INVALID_RESPONSE_MESSAGE, { cause });
    this.name = 'InvalidResponseError';
  }
}

/** Parses a successful response body with the shared contract schema. Throws InvalidResponseError on mismatch. */
export function parseResponse<TOutput>(schema: ZodType<TOutput>, data: unknown): TOutput {
  const result = schema.safeParse(data);
  if (!result.success) throw new InvalidResponseError(result.error);
  return result.data;
}
