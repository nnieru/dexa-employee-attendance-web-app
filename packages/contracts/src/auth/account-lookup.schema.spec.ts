import {
  ACCOUNT_LOOKUP_MAX_IDS,
  ACCOUNT_SEARCH_MAX_IDS,
  accountEmailQuerySchema,
  accountLookupItemSchema,
  accountLookupRequestSchema,
  accountSearchResponseSchema,
} from './account-lookup.schema.js';
import { Role } from './role.js';

const VALID_ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';

function uuidsOf(count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const suffix = index.toString(16).padStart(12, '0');
    return `5f0c1f3e-8d2a-4b7e-9c61-${suffix}`;
  });
}

// Two characters over the 254-character limit on company email.
const OVER_LIMIT_EMAIL = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(63)}.com`;

describe('accountLookupRequestSchema', () => {
  it('should accept the request when it carries the maximum number of IDs', () => {
    const request = { ids: uuidsOf(ACCOUNT_LOOKUP_MAX_IDS) };

    expect(accountLookupRequestSchema.parse(request)).toEqual(request);
  });

  it.each([
    {
      condition: 'it carries one more ID than the maximum',
      body: { ids: uuidsOf(ACCOUNT_LOOKUP_MAX_IDS + 1) },
    },
    { condition: 'the ID list is empty', body: { ids: [] } },
    { condition: 'an ID is not a UUID', body: { ids: ['not-a-uuid'] } },
    { condition: 'the ID list is missing', body: {} },
    {
      condition: 'an unknown field is present',
      body: { ids: [VALID_ACCOUNT_ID], email: 'nadia.rahma@dexa.test' },
    },
  ])('should reject the request when $condition', ({ body }) => {
    expect(accountLookupRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe('accountEmailQuerySchema', () => {
  it('should return the term trimmed when it has surrounding spaces', () => {
    expect(accountEmailQuerySchema.parse({ email: '  nadia.rahma  ' })).toEqual({
      email: 'nadia.rahma',
    });
  });

  it.each([
    { condition: 'the term is empty', query: { email: '' } },
    { condition: 'the term is only spaces', query: { email: '   ' } },
    { condition: 'the term is missing', query: {} },
    { condition: 'the term is longer than 254 characters', query: { email: OVER_LIMIT_EMAIL } },
    {
      condition: 'an unknown parameter is present',
      query: { email: 'nadia', page: '1' },
    },
  ])('should reject the query when $condition', ({ query }) => {
    expect(accountEmailQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('accountSearchResponseSchema', () => {
  it('should reject the response when it carries more IDs than the search maximum', () => {
    const response = { ids: uuidsOf(ACCOUNT_SEARCH_MAX_IDS + 1) };

    expect(accountSearchResponseSchema.safeParse(response).success).toBe(false);
  });
});

describe('accountLookupItemSchema', () => {
  it.each([
    { condition: 'the role is a known role code', role: Role.HR },
    { condition: 'the role is the employee role', role: Role.EMPLOYEE },
  ])('should accept the item when $condition', ({ role }) => {
    const item = { id: VALID_ACCOUNT_ID, email: 'nadia.rahma@dexa.test', role };

    expect(accountLookupItemSchema.parse(item)).toEqual(item);
  });

  it('should reject the item when the role code is not listed in the contracts', () => {
    const item = { id: VALID_ACCOUNT_ID, email: 'nadia.rahma@dexa.test', role: 'ADMIN' };

    expect(accountLookupItemSchema.safeParse(item).success).toBe(false);
  });
});
