import { z } from 'zod';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  createPageSchema,
  paginationQuerySchema,
} from './pagination.schema.js';

describe('paginationQuerySchema', () => {
  it('should apply the default page and page size when the query is empty', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
  });

  it('should coerce numeric strings when the query values arrive as strings', () => {
    expect(paginationQuerySchema.parse({ page: '2', pageSize: '50' })).toEqual({
      page: 2,
      pageSize: 50,
    });
  });

  it.each([
    { condition: 'page is 1 and pageSize is 1', query: { page: '1', pageSize: '1' } },
    { condition: `pageSize is ${MAX_PAGE_SIZE}`, query: { pageSize: String(MAX_PAGE_SIZE) } },
  ])('should accept the query when $condition', ({ query }) => {
    expect(paginationQuerySchema.safeParse(query).success).toBe(true);
  });

  it.each([
    { condition: 'page is 0', query: { page: '0' } },
    { condition: 'page is negative', query: { page: '-1' } },
    { condition: 'page is not an integer', query: { page: '1.5' } },
    { condition: 'pageSize is 0', query: { pageSize: '0' } },
    {
      condition: `pageSize is ${MAX_PAGE_SIZE + 1}`,
      query: { pageSize: String(MAX_PAGE_SIZE + 1) },
    },
    { condition: 'an unknown field is present', query: { sort: 'name' } },
  ])('should reject the query when $condition', ({ query }) => {
    expect(paginationQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('createPageSchema', () => {
  const employeePageSchema = createPageSchema(z.object({ employeeId: z.string().min(1) }));
  const validPage = {
    items: [{ employeeId: 'employee-1' }],
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    totalItems: 1,
    totalPages: 1,
  };

  it('should parse the page when the items and paging fields are valid', () => {
    expect(employeePageSchema.parse(validPage)).toEqual(validPage);
  });

  it('should reject the page when an item does not match the item schema', () => {
    const pageWithInvalidItem = { ...validPage, items: [{ employeeId: '' }] };

    expect(employeePageSchema.safeParse(pageWithInvalidItem).success).toBe(false);
  });

  it.each([
    { condition: 'totalItems is negative', overrides: { totalItems: -1 } },
    { condition: 'totalPages is negative', overrides: { totalPages: -1 } },
    { condition: 'page is 0', overrides: { page: 0 } },
    { condition: 'pageSize is 0', overrides: { pageSize: 0 } },
  ])('should reject the page when $condition', ({ overrides }) => {
    expect(employeePageSchema.safeParse({ ...validPage, ...overrides }).success).toBe(false);
  });
});
