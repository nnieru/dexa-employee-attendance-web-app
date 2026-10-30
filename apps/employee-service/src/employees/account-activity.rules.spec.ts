import {
  AccountActivityChange,
  isSelfDeactivation,
  resolveRequiredAccountActivity,
} from './account-activity.rules.js';

const ACTOR_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
const OTHER_ACCOUNT_ID = '7a1d2e3f-4b5c-4d6e-8f70-1a2b3c4d5e6f';

describe('resolveRequiredAccountActivity', () => {
  it.each([
    {
      condition: 'the requested status is INACTIVE',
      requested: 'INACTIVE',
      expected: 'DEACTIVATE',
    },
    { condition: 'the requested status is ACTIVE', requested: 'ACTIVE', expected: 'REACTIVATE' },
    {
      condition: 'the requested status is ON_LEAVE',
      requested: 'ON_LEAVE',
      expected: 'REACTIVATE',
    },
  ])('should return $expected when $condition', ({ requested, expected }) => {
    expect(resolveRequiredAccountActivity(requested)).toBe(expected);
  });
});

describe('isSelfDeactivation', () => {
  it.each([
    {
      condition: 'an HR account deactivates itself',
      actorAccountId: ACTOR_ID,
      targetAccountId: ACTOR_ID,
      activityChange: AccountActivityChange.DEACTIVATE,
      expected: true,
    },
    {
      condition: 'an HR account deactivates another account',
      actorAccountId: ACTOR_ID,
      targetAccountId: OTHER_ACCOUNT_ID,
      activityChange: AccountActivityChange.DEACTIVATE,
      expected: false,
    },
    {
      condition: 'an HR account reactivates itself',
      actorAccountId: ACTOR_ID,
      targetAccountId: ACTOR_ID,
      activityChange: AccountActivityChange.REACTIVATE,
      expected: false,
    },
    {
      condition: 'an HR account edits itself without a status',
      actorAccountId: ACTOR_ID,
      targetAccountId: ACTOR_ID,
      activityChange: undefined,
      expected: false,
    },
  ])('should return $expected when $condition', (change) => {
    expect(isSelfDeactivation(change)).toBe(change.expected);
  });
});
