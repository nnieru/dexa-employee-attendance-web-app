import { classifyArchiveFailure, readFailureCode } from './archive-failure.rules.js';

function errorWithCode(code: string): Error {
  return Object.assign(new Error('driver message with parameters'), { code });
}

function wrapped(cause: unknown): Error {
  return new Error('Failed query: insert ...', { cause });
}

describe('classifyArchiveFailure', () => {
  it.each([
    { condition: 'a data exception (22P02)', error: errorWithCode('22P02'), expected: 'permanent' },
    {
      condition: 'a string data right truncation (22001)',
      error: errorWithCode('22001'),
      expected: 'permanent',
    },
    {
      condition: 'a unique violation (23505)',
      error: errorWithCode('23505'),
      expected: 'permanent',
    },
    {
      condition: 'a not-null violation (23502)',
      error: errorWithCode('23502'),
      expected: 'permanent',
    },
    { condition: 'a syntax error (42601)', error: errorWithCode('42601'), expected: 'permanent' },
    {
      condition: 'an insufficient privilege error (42501)',
      error: errorWithCode('42501'),
      expected: 'permanent',
    },
    {
      condition: 'a constraint error only in the cause chain (23505)',
      error: wrapped(errorWithCode('23505')),
      expected: 'permanent',
    },
    {
      condition: 'a connection exception (08006)',
      error: errorWithCode('08006'),
      expected: 'transient',
    },
    {
      condition: 'insufficient resources (53300)',
      error: errorWithCode('53300'),
      expected: 'transient',
    },
    { condition: 'admin shutdown (57P01)', error: errorWithCode('57P01'), expected: 'transient' },
    {
      condition: 'a serialization failure (40001)',
      error: errorWithCode('40001'),
      expected: 'transient',
    },
    { condition: 'a deadlock (40P01)', error: errorWithCode('40P01'), expected: 'transient' },
    {
      condition: 'a query cancelled by the user (57014)',
      error: errorWithCode('57014'),
      expected: 'transient',
    },
    {
      condition: 'a connection refused (ECONNREFUSED)',
      error: errorWithCode('ECONNREFUSED'),
      expected: 'transient',
    },
    { condition: 'a broken pipe (EPIPE)', error: errorWithCode('EPIPE'), expected: 'transient' },
    {
      condition: 'a connection error only in the cause chain (08006)',
      error: wrapped(errorWithCode('08006')),
      expected: 'transient',
    },
    {
      condition: 'a node-postgres "Connection terminated unexpectedly" with no code',
      error: new Error('Connection terminated unexpectedly'),
      expected: 'transient',
    },
    {
      condition: 'an error with no code at all',
      error: new Error('something failed'),
      expected: 'transient',
    },
    { condition: 'a value that is not an error', error: 'boom', expected: 'transient' },
  ])('should classify as $expected when the failure is $condition', ({ error, expected }) => {
    expect(classifyArchiveFailure(error)).toBe(expected);
  });
});

describe('readFailureCode', () => {
  it('should return the code of the innermost driver error without its message', () => {
    const code = readFailureCode(wrapped(errorWithCode('23505')));

    expect(code).toBe('23505');
  });

  it('should return undefined when no error in the chain has a code', () => {
    expect(readFailureCode(wrapped(new Error('no code')))).toBeUndefined();
  });
});
