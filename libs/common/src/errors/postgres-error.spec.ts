import { ErrorCode } from '@dexa/contracts';
import { ConflictError } from './domain.errors.js';
import {
  isExclusionViolation,
  isUniqueViolation,
  readUniqueViolationConstraint,
  toConflictError,
} from './postgres-error.js';

function databaseError(sqlState: string): Error & { code: string } {
  return Object.assign(new Error('driver failure'), { code: sqlState });
}

function thrownBy(action: () => unknown): unknown {
  try {
    action();
  } catch (thrown: unknown) {
    return thrown;
  }
  throw new Error('Expected the call to throw');
}

describe('isUniqueViolation', () => {
  it.each([
    { condition: 'the error carries SQLSTATE 23505', error: databaseError('23505') },
    {
      condition: 'the SQLSTATE 23505 error is wrapped as a cause',
      error: new Error('Failed query', { cause: databaseError('23505') }),
    },
    {
      condition: 'the SQLSTATE 23505 error is two causes deep',
      error: new Error('Transaction failed', {
        cause: new Error('Failed query', { cause: databaseError('23505') }),
      }),
    },
  ])('should return true when $condition', ({ error }) => {
    expect(isUniqueViolation(error)).toBe(true);
  });

  it.each([
    { condition: 'the error carries SQLSTATE 23P01', error: databaseError('23P01') },
    {
      condition: 'the error carries a Node error code',
      error: Object.assign(new Error('connect failed'), { code: 'ECONNREFUSED' }),
    },
    {
      condition: 'the wrapped cause carries SQLSTATE 23P01',
      error: new Error('Failed query', { cause: databaseError('23P01') }),
    },
    { condition: 'the error is null', error: null },
    { condition: 'the error is undefined', error: undefined },
    { condition: 'the error is the SQLSTATE string itself', error: '23505' },
    { condition: 'the error is an object without a code', error: {} },
    { condition: 'the code is a number rather than a string', error: { code: 23505 } },
  ])('should return false when $condition', ({ error }) => {
    expect(isUniqueViolation(error)).toBe(false);
  });

  it('should return false without looping when the cause chain is cyclic', () => {
    const cyclic = new Error('loop');
    cyclic.cause = cyclic;

    expect(isUniqueViolation(cyclic)).toBe(false);
  });
});

describe('isExclusionViolation', () => {
  it.each([
    { condition: 'the error carries SQLSTATE 23P01', error: databaseError('23P01') },
    {
      condition: 'the SQLSTATE 23P01 error is wrapped as a cause',
      error: new Error('Failed query', { cause: databaseError('23P01') }),
    },
  ])('should return true when $condition', ({ error }) => {
    expect(isExclusionViolation(error)).toBe(true);
  });

  it.each([
    { condition: 'the error carries SQLSTATE 23505', error: databaseError('23505') },
    { condition: 'the error is null', error: null },
    { condition: 'the error is a plain string', error: 'boom' },
  ])('should return false when $condition', ({ error }) => {
    expect(isExclusionViolation(error)).toBe(false);
  });
});

describe('toConflictError', () => {
  it.each([
    { condition: 'the error is a unique violation', error: databaseError('23505') },
    { condition: 'the error is an exclusion violation', error: databaseError('23P01') },
    {
      condition: 'the unique violation is wrapped by the query layer',
      error: new Error('Failed query', { cause: databaseError('23505') }),
    },
  ])('should return a conflict error with the original as cause when $condition', ({ error }) => {
    const conflict = toConflictError(error, ErrorCode.CONFLICT, 'Already exists.');

    expect(conflict).toBeInstanceOf(ConflictError);
    expect(conflict.code).toBe(ErrorCode.CONFLICT);
    expect(conflict.message).toBe('Already exists.');
    expect(conflict.cause).toBe(error);
  });

  it.each([
    { condition: 'the SQLSTATE is a foreign key violation', error: databaseError('23503') },
    { condition: 'the error is not a database error', error: new Error('boom') },
    { condition: 'the error is not an object', error: 'boom' },
  ])('should rethrow the original error when $condition', ({ error }) => {
    expect(thrownBy(() => toConflictError(error, ErrorCode.CONFLICT, 'Already exists.'))).toBe(
      error,
    );
  });
});

describe('readUniqueViolationConstraint', () => {
  function namedDatabaseError(sqlState: string, constraint: string): Error & { code: string } {
    return Object.assign(new Error('driver failure'), { code: sqlState, constraint });
  }

  it.each([
    {
      condition: 'the unique violation names its constraint',
      error: namedDatabaseError('23505', 'accounts_company_email_uq'),
      expected: 'accounts_company_email_uq',
    },
    {
      condition: 'the named unique violation is wrapped as a cause',
      error: new Error('Failed query', {
        cause: namedDatabaseError('23505', 'account_provisioning_operations_operation_id_pk'),
      }),
      expected: 'account_provisioning_operations_operation_id_pk',
    },
  ])('should return the constraint name when $condition', ({ error, expected }) => {
    expect(readUniqueViolationConstraint(error)).toBe(expected);
  });

  it.each([
    {
      condition: 'the error is an exclusion violation',
      error: namedDatabaseError('23P01', 'x_ex'),
    },
    { condition: 'the unique violation names no constraint', error: databaseError('23505') },
    { condition: 'the error is not a database error', error: new Error('connect failed') },
    { condition: 'the error is null', error: null },
  ])('should return undefined when $condition', ({ error }) => {
    expect(readUniqueViolationConstraint(error)).toBeUndefined();
  });
});
