import { ConflictError } from './domain.errors.js';
import { isRecord } from './is-record.js';

const UNIQUE_VIOLATION_SQL_STATE = '23505';
const EXCLUSION_VIOLATION_SQL_STATE = '23P01';
const CHECK_VIOLATION_SQL_STATE = '23514';
// Drizzle wraps driver errors, sometimes more than once. The bound stops a cyclic cause chain.
const MAX_CAUSE_DEPTH = 5;

export function isUniqueViolation(error: unknown): boolean {
  return hasSqlState(error, UNIQUE_VIOLATION_SQL_STATE);
}

export function isExclusionViolation(error: unknown): boolean {
  return hasSqlState(error, EXCLUSION_VIOLATION_SQL_STATE);
}

/**
 * Returns the name of the index or constraint that rejected the row, when the driver reports one.
 * Callers use it to tell apart two unique indexes that fail in the same statement. It is undefined
 * for any error that is not a unique violation.
 */
export function readUniqueViolationConstraint(error: unknown): string | undefined {
  return readConstraintName(error, UNIQUE_VIOLATION_SQL_STATE);
}

/**
 * Returns the name of the check constraint that rejected the row. A trigger that raises a check_violation
 * names its constraint the same way, so a rule kept in a trigger maps to the same name.
 */
export function readCheckViolationConstraint(error: unknown): string | undefined {
  return readConstraintName(error, CHECK_VIOLATION_SQL_STATE);
}

/**
 * Turns a unique or exclusion violation into a conflict that keeps the driver error as its cause.
 * Any other error is rethrown unchanged, so a real failure is never reported as a conflict.
 */
export function toConflictError(error: unknown, code: string, message: string): ConflictError {
  if (!isUniqueViolation(error) && !isExclusionViolation(error)) throw error;
  return new ConflictError(code, message, { cause: error });
}

function readConstraintName(error: unknown, sqlState: string): string | undefined {
  const violation = findSqlStateError(error, sqlState);
  return violation !== undefined && typeof violation.constraint === 'string'
    ? violation.constraint
    : undefined;
}

function hasSqlState(error: unknown, sqlState: string): boolean {
  return findSqlStateError(error, sqlState) !== undefined;
}

function findSqlStateError(error: unknown, sqlState: string): Record<string, unknown> | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && isRecord(current); depth += 1) {
    if (current.code === sqlState) return current;
    current = current.cause;
  }
  return undefined;
}
