import { describe, expect, it } from 'vitest';
import { requestsSearchSchema, resolveRequestsSearch } from './requests-search.schema.js';

describe('requests search schema', () => {
  it.each([
    { case: 'an empty URL', input: {}, expected: {} },
    {
      case: 'a valid tab, status and page',
      input: { tab: 'corrections', status: 'REJECTED', page: '3' },
      expected: { tab: 'corrections', status: 'REJECTED', page: 3 },
    },
    {
      case: 'an unknown tab',
      input: { tab: 'leave' },
      expected: {},
    },
    {
      case: 'a status in the wrong case',
      input: { status: 'approved' },
      expected: {},
    },
    {
      case: 'the word All as a status, which means no filter',
      input: { status: 'ALL' },
      expected: {},
    },
    {
      case: 'an empty status',
      input: { status: '' },
      expected: {},
    },
    {
      case: 'a page of zero',
      input: { page: '0' },
      expected: {},
    },
    {
      case: 'a page that is not a whole number',
      input: { page: '1.5' },
      expected: {},
    },
    {
      case: 'a page that is not a number',
      input: { page: 'two' },
      expected: {},
    },
  ])(
    'should drop the unusable value and keep no default when the URL has $case',
    ({ input, expected }) => {
      expect(requestsSearchSchema.parse(input)).toEqual(expected);
    },
  );
});

describe('resolveRequestsSearch', () => {
  it.each([
    {
      case: 'an empty URL',
      search: {},
      expected: { tab: 'overtime', status: undefined, page: 1 },
    },
    {
      case: 'a URL with only a status',
      search: { status: 'PENDING' as const },
      expected: { tab: 'overtime', status: 'PENDING', page: 1 },
    },
    {
      case: 'a URL with a tab and a page',
      search: { tab: 'corrections' as const, page: 4 },
      expected: { tab: 'corrections', status: undefined, page: 4 },
    },
  ])('should fill the defaults from $case', ({ search, expected }) => {
    expect(resolveRequestsSearch(search)).toEqual(expected);
  });
});
