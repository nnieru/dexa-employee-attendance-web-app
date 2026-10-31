import { classifyArchiveFailure } from './archive-failure.rules.js';

export type RetryPolicy = {
  /** The pause after each failed attempt except the last. Five attempts make four pauses. */
  readonly delaysMs: ReadonlyArray<number>;
  readonly sleep: (milliseconds: number) => Promise<void>;
};

export type ArchiveAttemptOutcome =
  { readonly kind: 'archived' } | { readonly kind: 'failed'; readonly error: unknown };

/**
 * Classifies each failure before deciding whether to retry. A permanent failure ends at once, with no pause. A
 * transient failure is retried after the policy's pauses. The result carries the last error, so the caller can
 * classify it again and settle the delivery. The sleep is injected so tests do not wait.
 */
export async function archiveWithRetry(
  attempt: () => Promise<void>,
  policy: RetryPolicy,
): Promise<ArchiveAttemptOutcome> {
  const attemptCount = policy.delaysMs.length + 1;
  let lastError: unknown;
  for (let attemptIndex = 0; attemptIndex < attemptCount; attemptIndex += 1) {
    try {
      await attempt();
      return { kind: 'archived' };
    } catch (error: unknown) {
      lastError = error;
      if (classifyArchiveFailure(error) === 'permanent') {
        return { kind: 'failed', error };
      }
      const delayMs = policy.delaysMs[attemptIndex];
      if (delayMs !== undefined) {
        await policy.sleep(delayMs);
      }
    }
  }
  return { kind: 'failed', error: lastError };
}

export function sleep(milliseconds: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
