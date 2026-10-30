import { MAX_PAGE_SIZE } from '../pagination/pagination.schema.js';
import { employeeListItemSchema, employeeListQuerySchema } from './employee-list.schema.js';

const ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
const SEARCH_TERM_MAX_LENGTH = 254;

describe('employeeListQuerySchema', () => {
  it('should apply the default page and page size when the query is empty', () => {
    expect(employeeListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20, q: undefined });
  });

  it('should coerce the paging values and keep the trimmed search term', () => {
    expect(employeeListQuerySchema.parse({ page: '2', pageSize: '50', q: '  Nadia  ' })).toEqual({
      page: 2,
      pageSize: 50,
      q: 'Nadia',
    });
  });

  it.each([
    { condition: 'q is empty', query: { q: '' } },
    { condition: 'q is only whitespace', query: { q: '   ' } },
  ])('should treat the search as absent when $condition', ({ query }) => {
    expect(employeeListQuerySchema.parse(query).q).toBeUndefined();
  });

  it('should accept a search term of exactly 254 characters', () => {
    const term = 'a'.repeat(SEARCH_TERM_MAX_LENGTH);

    expect(employeeListQuerySchema.parse({ q: term }).q).toBe(term);
  });

  it.each([
    { condition: 'pageSize is above the maximum', query: { pageSize: String(MAX_PAGE_SIZE + 1) } },
    { condition: 'page is 0', query: { page: '0' } },
    { condition: 'q is longer than 254 characters', query: { q: 'a'.repeat(255) } },
    { condition: 'an unknown key is present', query: { sort: 'name' } },
    { condition: 'a second search key is present', query: { email: 'nadia@dexa.test' } },
  ])('should reject the query when $condition', ({ query }) => {
    expect(employeeListQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('employeeListItemSchema', () => {
  const validItem = {
    accountId: ACCOUNT_ID,
    name: 'Nadia Rahma',
    email: 'nadia.rahma@dexa.test',
    role: 'EMPLOYEE',
    position: { id: ACCOUNT_ID, code: 'FULLSTACK_DEVELOPER', name: 'Fullstack Developer' },
    employeeStatus: { id: ACCOUNT_ID, code: 'ACTIVE', name: 'Active' },
    phoneNumber: null,
    profileStatus: 'INCOMPLETE',
    photoUrl: null,
  };

  it('should accept the item when Auth supplied the email and role', () => {
    expect(employeeListItemSchema.parse(validItem)).toEqual(validItem);
  });

  it('should accept the item when Auth did not supply the email and role', () => {
    const item = { ...validItem, email: null, role: null };

    expect(employeeListItemSchema.parse(item)).toEqual(item);
  });

  it('should reject the item when the role is not a known role', () => {
    expect(employeeListItemSchema.safeParse({ ...validItem, role: 'ADMIN' }).success).toBe(false);
  });
});
