import { accountPasswordChangedPayloadSchema } from './account-password-changed.schema.js';

const ACCOUNT_ID = '9b1e4c7d-2f3a-4e5b-8c6d-1a2b3c4d5e6f';
const ACTOR_ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';

const VALID_PAYLOAD = {
  accountId: ACCOUNT_ID,
  actorAccountId: ACTOR_ACCOUNT_ID,
  changedFields: ['password'],
};

describe('accountPasswordChangedPayloadSchema', () => {
  it('should accept the payload when changedFields is exactly password', () => {
    expect(accountPasswordChangedPayloadSchema.safeParse(VALID_PAYLOAD).success).toBe(true);
  });

  it.each([
    { condition: 'a password key is present', extra: { password: 'new-pass-123' } },
    { condition: 'a passwordHash key is present', extra: { passwordHash: '$argon2id$v=19' } },
    { condition: 'an oldValues key is present', extra: { oldValues: { password: 'old' } } },
    { condition: 'a newValues key is present', extra: { newValues: { password: 'new' } } },
  ])('should reject the payload when $condition', ({ extra }) => {
    expect(
      accountPasswordChangedPayloadSchema.safeParse({ ...VALID_PAYLOAD, ...extra }).success,
    ).toBe(false);
  });

  it.each([
    { condition: 'changedFields is empty', changedFields: [] },
    { condition: 'changedFields also names a profile field', changedFields: ['password', 'name'] },
    { condition: 'changedFields names only a profile field', changedFields: ['name'] },
    { condition: 'changedFields repeats password', changedFields: ['password', 'password'] },
  ])('should reject the payload when $condition', ({ changedFields }) => {
    expect(
      accountPasswordChangedPayloadSchema.safeParse({ ...VALID_PAYLOAD, changedFields }).success,
    ).toBe(false);
  });

  it('should reject the payload when accountId is not a UUID', () => {
    expect(
      accountPasswordChangedPayloadSchema.safeParse({ ...VALID_PAYLOAD, accountId: 'acc-1' })
        .success,
    ).toBe(false);
  });
});
