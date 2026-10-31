/**
 * permanent: a retry cannot change the outcome, so the message is parked for review without retries (D-46).
 * transient: the database may accept the write later, so it is retried, then requeued and the consumer pauses.
 */
export type ArchiveFailureKind = 'transient' | 'permanent';

// SQLSTATE classes whose failures repeat on every attempt: 22 data exception, 23 integrity violation, and 42 syntax
// or access error. Every other error is transient, including errors with no code, so nothing is parked by guessing.
const PERMANENT_SQLSTATE_CLASSES: ReadonlySet<string> = new Set(['22', '23', '42']);

// SQLSTATE: two-character class, then three characters.
const SQLSTATE_PATTERN = /^[0-9]{2}[0-9A-Z]{3}$/;

export function classifyArchiveFailure(error: unknown): ArchiveFailureKind {
  const code = readFailureCode(error);
  if (code !== undefined && SQLSTATE_PATTERN.test(code)) {
    return PERMANENT_SQLSTATE_CLASSES.has(code.slice(0, 2)) ? 'permanent' : 'transient';
  }
  return 'transient';
}

/**
 * The SQLSTATE or network code of an error, searched through its cause chain. Drizzle wraps the driver error, and
 * the wrapper's message can echo query parameters, so callers log this code and never the message.
 */
export function readFailureCode(error: unknown): string | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }
  if ('code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return readFailureCode(error.cause);
}
