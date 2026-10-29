import { ConflictError } from './domain.errors.js';
import { isRecord } from './is-record.js';

const UNIQUE_VIOLATION_SQL_STATE = '23505';
const EXCLUSION_VIOLATION_SQL_STATE = '23P01';
// Drizzle wraps driver errors, sometimes more than once. The bound stops a cyclic cause chain.
const MAX_CAUSE_DEPTH = 5;

export function isUniqueViolation(error: unknown): boolean {
  return hasSqlState(error, UNIQUE_VIOLATION_SQL_STATE);
}

export function isExclusionViolation(error: unknown): boolean {
  return hasSqlState(error, EXCLUSION_VIOLATION_SQL_STATE);
}

/**
 * Turns a unique or exclusion violation into a conflict that keeps the driver error as its cause.
 * Any other error is rethrown unchanged, so a real failure is never reported as a conflict.
 */
export function toConflictError(error: unknown, code: string, message: string): ConflictError {
  if (!isUniqueViolation(error) && !isExclusionViolation(error)) throw error;
  return new ConflictError(code, message, { cause: error });
}

function hasSqlState(error: unknown, sqlState: string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && isRecord(current); depth += 1) {
    if (current.code === sqlState) return true;
    current = current.cause;
  }
  return false;
}
