import { EMPLOYEE_LOOKUP_MAX_IDS, employeeLookupRequestSchema } from './employee-lookup.schema.js';

const VALID_ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';

function uuidsOf(count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const suffix = index.toString(16).padStart(12, '0');
    return `5f0c1f3e-8d2a-4b7e-9c61-${suffix}`;
  });
}

describe('employeeLookupRequestSchema', () => {
  it('should accept the request when it carries the maximum number of IDs', () => {
    const request = { accountIds: uuidsOf(EMPLOYEE_LOOKUP_MAX_IDS) };

    expect(employeeLookupRequestSchema.parse(request)).toEqual(request);
  });

  it('should accept the request when it carries one ID', () => {
    const request = { accountIds: [VALID_ACCOUNT_ID] };

    expect(employeeLookupRequestSchema.parse(request)).toEqual(request);
  });

  it.each([
    {
      condition: 'it carries one more ID than the maximum',
      body: { accountIds: uuidsOf(EMPLOYEE_LOOKUP_MAX_IDS + 1) },
    },
    { condition: 'the ID list is empty', body: { accountIds: [] } },
    { condition: 'an ID is not a UUID', body: { accountIds: ['not-a-uuid'] } },
    { condition: 'the ID list is missing', body: {} },
    {
      condition: 'an unknown field is present',
      body: { accountIds: [VALID_ACCOUNT_ID], email: 'nadia.rahma@dexa.test' },
    },
  ])('should reject the request when $condition', ({ body }) => {
    expect(employeeLookupRequestSchema.safeParse(body).success).toBe(false);
  });
});
