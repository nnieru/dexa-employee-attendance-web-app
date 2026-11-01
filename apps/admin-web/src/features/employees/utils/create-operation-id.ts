/**
 * The operation ID that makes a create retryable (DATABASE §4.3). The form calls this once per session, and a retry
 * sends the same ID. Tests replace it by spying on crypto.randomUUID.
 */
export function createOperationId(): string {
  return crypto.randomUUID();
}
