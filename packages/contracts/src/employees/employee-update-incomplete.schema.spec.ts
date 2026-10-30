import { employeeUpdateIncompleteDetailsSchema } from './employee-update-incomplete.schema.js';

const ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';

describe('employeeUpdateIncompleteDetailsSchema', () => {
  it('should parse the details with each step outcome, including null for an unconfirmed step', () => {
    const details = {
      accountId: ACCOUNT_ID,
      profileSaved: true,
      accountStatusSaved: null,
      passwordReset: null,
    };

    expect(employeeUpdateIncompleteDetailsSchema.parse(details)).toEqual(details);
  });

  it.each([
    { condition: 'the profile outcome is null', patch: { profileSaved: null } },
    { condition: 'the account ID is not a UUID', patch: { accountId: 'account' } },
    { condition: 'a field is not part of the answer', patch: { passwordHash: 'x' } },
  ])('should reject the details when $condition', ({ patch }) => {
    expect(
      employeeUpdateIncompleteDetailsSchema.safeParse({
        accountId: ACCOUNT_ID,
        profileSaved: false,
        accountStatusSaved: false,
        passwordReset: false,
        ...patch,
      }).success,
    ).toBe(false);
  });
});
