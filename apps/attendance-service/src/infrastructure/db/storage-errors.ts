import { DrizzleQueryError } from 'drizzle-orm';

/**
 * Wraps a failed read or write with a message that names no statement or value. The driver error of a failed
 * statement carries the SQL and its bind values, so the cause keeps only what the driver reports (its SQLSTATE and
 * database message). Copied from employee-service, so this service keeps its own boundary.
 */
export function wrapStorageError(error: unknown, message: string): Error {
  return new Error(message, { cause: error instanceof DrizzleQueryError ? error.cause : error });
}
