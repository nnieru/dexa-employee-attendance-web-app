import { describe, expect, it } from 'vitest';
import {
  employeeListSearchSchema,
  resolveEmployeeListSearch,
} from './employee-list-search.schema.js';

describe('employeeListSearchSchema', () => {
  it.each([
    ['a missing page', {}, undefined],
    ['a page that is not a number', { page: 'abc' }, undefined],
    ['a page of zero', { page: '0' }, undefined],
    ['a negative page', { page: '-2' }, undefined],
    ['a fractional page', { page: '2.5' }, undefined],
    ['an empty page', { page: '' }, undefined],
    ['a valid page', { page: '4' }, 4],
  ])('should resolve the page when the URL has %s', (_label, rawSearch, expectedPage) => {
    const search = employeeListSearchSchema.parse(rawSearch);

    expect(resolveEmployeeListSearch(search).page).toBe(expectedPage ?? 1);
  });

  it.each([
    ['a pageSize above the contract limit', { pageSize: '500' }, 20],
    ['a pageSize of zero', { pageSize: '0' }, 20],
    ['a valid pageSize', { pageSize: '50' }, 50],
  ])('should resolve the page size when the URL has %s', (_label, rawSearch, expectedPageSize) => {
    const search = employeeListSearchSchema.parse(rawSearch);

    expect(resolveEmployeeListSearch(search).pageSize).toBe(expectedPageSize);
  });

  it('should trim the search term and keep it when it fits the limit', () => {
    const search = employeeListSearchSchema.parse({ q: '  rina@dexa.test ' });

    expect(resolveEmployeeListSearch(search).q).toBe('rina@dexa.test');
  });

  it('should drop the search term when it is longer than 254 characters', () => {
    const search = employeeListSearchSchema.parse({ q: 'a'.repeat(255) });

    expect(resolveEmployeeListSearch(search).q).toBe('');
  });

  it('should keep no keys when the URL names no search state, so the address is not rewritten', () => {
    expect(employeeListSearchSchema.parse({})).toEqual({});
  });
});
