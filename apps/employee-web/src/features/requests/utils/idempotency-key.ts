import type { SubmitOvertimeRequest } from '@dexa/contracts';

/** A fresh key for one submission attempt. Kept as a function so tests can fake it through crypto.randomUUID. */
export function createIdempotencyKey(): string {
  return crypto.randomUUID();
}

/** The overtime request content that the idempotency key covers. The key itself is excluded. */
export type OvertimeRequestPayload = Omit<SubmitOvertimeRequest, 'idempotencyKey'>;

/** The content of the last submitted attempt, with the key that was sent for it. */
export type SubmittedAttempt<TPayload extends Readonly<Record<string, unknown>>> = {
  idempotencyKey: string;
  payload: TPayload;
};

/**
 * The key for the next submission. A retry with the same content as the last submitted attempt reuses that key, so the
 * server can answer the first request's result (APR-5). Changed content gets a new key, because the server refuses a
 * key that comes back with different content (IDEMPOTENCY_KEY_CONFLICT). With no earlier attempt, a new key is made.
 * Used by the overtime and the correction forms, which share this rule.
 */
export function resolveAttemptIdempotencyKey<TPayload extends Readonly<Record<string, unknown>>>(
  lastAttempt: SubmittedAttempt<TPayload> | null,
  payload: TPayload,
  createKey: () => string,
): string {
  if (lastAttempt !== null && isSameRequestPayload(lastAttempt.payload, payload)) {
    return lastAttempt.idempotencyKey;
  }
  return createKey();
}

/**
 * True when both payloads hold the same keys with the same values. A key present in one payload and absent in the other
 * is a change: a correction without a clock-out is not the same request as one with a clock-out.
 */
export function isSameRequestPayload(
  first: Readonly<Record<string, unknown>>,
  second: Readonly<Record<string, unknown>>,
): boolean {
  const firstKeys = Object.keys(first);
  if (firstKeys.length !== Object.keys(second).length) return false;
  return firstKeys.every((key) => Object.hasOwn(second, key) && first[key] === second[key]);
}
