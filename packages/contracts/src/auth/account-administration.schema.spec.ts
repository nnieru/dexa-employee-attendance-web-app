import {
  resetAccountPasswordRequestSchema,
  setAccountActiveStatusRequestSchema,
} from './account-administration.schema.js';

const ACTOR_ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
const ACCOUNT_ID = '9b1e4c7d-2f3a-4e5b-8c6d-1a2b3c4d5e6f';
const VALID_PASSWORD = 'reset-pass-1';

describe('resetAccountPasswordRequestSchema', () => {
  it('should accept the request when the actor is a UUID and the password meets the policy', () => {
    const request = { actorAccountId: ACTOR_ACCOUNT_ID, newPassword: VALID_PASSWORD };

    expect(resetAccountPasswordRequestSchema.parse(request)).toEqual(request);
  });

  it.each([
    {
      condition: 'an unknown field is present',
      body: {
        actorAccountId: ACTOR_ACCOUNT_ID,
        newPassword: VALID_PASSWORD,
        accountId: ACCOUNT_ID,
      },
    },
    {
      condition: 'the actor ID is missing',
      body: { newPassword: VALID_PASSWORD },
    },
    {
      condition: 'the actor ID is not a UUID',
      body: { actorAccountId: 'hr-1', newPassword: VALID_PASSWORD },
    },
    {
      condition: 'the password is too short',
      body: { actorAccountId: ACTOR_ACCOUNT_ID, newPassword: 'abc1' },
    },
    {
      condition: 'the password has no digit',
      body: { actorAccountId: ACTOR_ACCOUNT_ID, newPassword: 'password-only' },
    },
  ])('should reject the request when $condition', ({ body }) => {
    expect(resetAccountPasswordRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe('setAccountActiveStatusRequestSchema', () => {
  it.each([true, false])('should accept the request when isActive is %s', (isActive) => {
    const request = { actorAccountId: ACTOR_ACCOUNT_ID, isActive };

    expect(setAccountActiveStatusRequestSchema.parse(request)).toEqual(request);
  });

  it.each([
    {
      condition: 'an unknown field is present',
      body: { actorAccountId: ACTOR_ACCOUNT_ID, isActive: false, role: 'HR' },
    },
    {
      condition: 'isActive is a string',
      body: { actorAccountId: ACTOR_ACCOUNT_ID, isActive: 'false' },
    },
    {
      condition: 'isActive is missing',
      body: { actorAccountId: ACTOR_ACCOUNT_ID },
    },
    {
      condition: 'the actor ID is not a UUID',
      body: { actorAccountId: 'hr-1', isActive: false },
    },
  ])('should reject the request when $condition', ({ body }) => {
    expect(setAccountActiveStatusRequestSchema.safeParse(body).success).toBe(false);
  });
});
