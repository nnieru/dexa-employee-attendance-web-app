import { types } from 'node:util';

/** Formats a caught value for a log line. Stack traces and connection URLs stay out of logs. */
export function describeError(error: unknown): string {
  return types.isNativeError(error) ? `${error.name}: ${error.message}` : 'unknown error';
}
