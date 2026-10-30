import {
  isAdministrableAccount,
  isSelfDeactivation,
  type AdministeredAccount,
} from './account-administration.rules.js';

const ACTOR_ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
const TARGET_ACCOUNT_ID = '9b1e4c7d-2f3a-4e5b-8c6d-1a2b3c4d5e6f';

describe('isAdministrableAccount', () => {
  const ACTIVATED: AdministeredAccount = { isProvisioningPending: false };

  it.each([
    {
      condition: 'the account has been activated by provisioning',
      account: ACTIVATED,
      expected: true,
    },
    {
      condition: 'the account is still PENDING provisioning',
      account: { isProvisioningPending: true },
      expected: false,
    },
    { condition: 'the account does not exist', account: undefined, expected: false },
  ])('should return $expected when $condition', ({ account, expected }) => {
    expect(isAdministrableAccount(account)).toBe(expected);
  });
});

describe('isSelfDeactivation', () => {
  it.each([
    {
      condition: 'the actor deactivates its own account',
      change: {
        actorAccountId: ACTOR_ACCOUNT_ID,
        targetAccountId: ACTOR_ACCOUNT_ID,
        isActive: false,
      },
      expected: true,
    },
    {
      condition: 'the actor reactivates its own account',
      change: {
        actorAccountId: ACTOR_ACCOUNT_ID,
        targetAccountId: ACTOR_ACCOUNT_ID,
        isActive: true,
      },
      expected: false,
    },
    {
      condition: 'the actor deactivates another account',
      change: {
        actorAccountId: ACTOR_ACCOUNT_ID,
        targetAccountId: TARGET_ACCOUNT_ID,
        isActive: false,
      },
      expected: false,
    },
  ])('should return $expected when $condition', ({ change, expected }) => {
    expect(isSelfDeactivation(change)).toBe(expected);
  });
});
