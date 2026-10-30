import { currentAccountSchema } from './current-account.schema.js';
import { Role } from './role.js';

const ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';

describe('currentAccountSchema', () => {
  it('should accept the account when its ID, email, and role are valid', () => {
    const account = { id: ACCOUNT_ID, email: 'nadia.rahma@dexa.test', role: Role.EMPLOYEE };

    expect(currentAccountSchema.parse(account)).toEqual(account);
  });

  it.each([
    {
      condition: 'the ID is not a UUID',
      body: { id: 'account-1', email: 'nadia.rahma@dexa.test', role: Role.EMPLOYEE },
    },
    {
      condition: 'the email is not an address',
      body: { id: ACCOUNT_ID, email: 'nadia', role: Role.EMPLOYEE },
    },
    {
      condition: 'the role is not a known role',
      body: { id: ACCOUNT_ID, email: 'nadia.rahma@dexa.test', role: 'ADMIN' },
    },
  ])('should reject the account when $condition', ({ body }) => {
    expect(currentAccountSchema.safeParse(body).success).toBe(false);
  });
});
