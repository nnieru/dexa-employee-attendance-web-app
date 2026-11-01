import type { SubmitOvertimeRequest } from '@dexa/contracts';

/** A fresh key for one submission attempt. Kept as a function so tests can fake it through crypto.randomUUID. */
export function createIdempotencyKey(): string {
  return crypto.randomUUID();
}

/** The request content that the idempotency key covers. The key itself is excluded. */
export type OvertimeRequestPayload = Omit<SubmitOvertimeRequest, 'idempotencyKey'>;

export type SubmittedAttempt = {
  idempotencyKey: string;
  payload: OvertimeRequestPayload;
};

/**
 * The key for the next submission. A retry with the same content as the last submitted attempt reuses that key, so the
 * server can answer the first request's result (APR-5). Changed content gets a new key, because the server refuses a
 * key that comes back with different content (IDEMPOTENCY_KEY_CONFLICT). With no earlier attempt, a new key is made.
 */
export function resolveAttemptIdempotencyKey(
  lastAttempt: SubmittedAttempt | null,
  payload: OvertimeRequestPayload,
  createKey: () => string,
): string {
  if (lastAttempt !== null && isSameOvertimeRequestPayload(lastAttempt.payload, payload)) {
    return lastAttempt.idempotencyKey;
  }
  return createKey();
}

export function isSameOvertimeRequestPayload(
  first: OvertimeRequestPayload,
  second: OvertimeRequestPayload,
): boolean {
  return (
    first.businessDate === second.businessDate &&
    first.startAt === second.startAt &&
    first.endAt === second.endAt &&
    first.reason === second.reason
  );
}
