import { DrizzleQueryError } from 'drizzle-orm';

/**
 * Wraps a failed read or write with a message that names no statement or value. The driver error keeps the bind
 * parameters of the failed statement, and an employee write binds the phone number, so the cause keeps only what the
 * driver reports (its SQLSTATE and database message).
 */
export function wrapStorageError(error: unknown, message: string): Error {
  return new Error(message, { cause: error instanceof DrizzleQueryError ? error.cause : error });
}
