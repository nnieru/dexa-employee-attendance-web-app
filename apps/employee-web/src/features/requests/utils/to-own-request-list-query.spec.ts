import { describe, expect, it } from 'vitest';
import { toOwnRequestListQuery } from './to-own-request-list-query.js';

describe('toOwnRequestListQuery', () => {
  it('should leave the status out when the filter is All', () => {
    const query = toOwnRequestListQuery({ tab: 'overtime', status: undefined, page: 2 });

    expect(query).toEqual({ page: 2, pageSize: 20 });
    expect(Object.keys(query)).not.toContain('status');
  });

  it('should send the chosen status when the filter names one', () => {
    expect(toOwnRequestListQuery({ tab: 'corrections', status: 'APPROVED', page: 1 })).toEqual({
      status: 'APPROVED',
      page: 1,
      pageSize: 20,
    });
  });
});
