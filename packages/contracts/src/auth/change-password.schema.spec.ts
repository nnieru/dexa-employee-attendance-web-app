import { changePasswordRequestSchema } from './change-password.schema.js';
import { CURRENT_PASSWORD_MAX_LENGTH } from './current-password.schema.js';
import { PASSWORD_MAX_LENGTH } from './password.schema.js';

const VALID_REQUEST = {
  currentPassword: 'old-password-1',
  newPassword: 'new-password-2',
};

describe('changePasswordRequestSchema', () => {
  it('should accept the current password unchanged when it fails the password policy', () => {
    // A password set before the policy existed must still be able to change.
    const parsed = changePasswordRequestSchema.parse({ ...VALID_REQUEST, currentPassword: 'abc' });

    expect(parsed.currentPassword).toBe('abc');
  });

  it('should accept the new password unchanged when it has surrounding spaces', () => {
    const parsed = changePasswordRequestSchema.parse({
      ...VALID_REQUEST,
      newPassword: ' new-password-2 ',
    });

    expect(parsed.newPassword).toBe(' new-password-2 ');
  });

  it.each([
    {
      condition: 'an unknown field is present',
      body: { ...VALID_REQUEST, accountId: 'b1f0c2d4-7a3e-4f19-8c5b-2d6e7f8a9b0c' },
    },
    { condition: 'the current password is missing', body: { newPassword: 'new-password-2' } },
    { condition: 'the current password is empty', body: { ...VALID_REQUEST, currentPassword: '' } },
    {
      condition: 'the current password is longer than the login bound',
      body: { ...VALID_REQUEST, currentPassword: 'p'.repeat(CURRENT_PASSWORD_MAX_LENGTH + 1) },
    },
    { condition: 'the new password is missing', body: { currentPassword: 'old-password-1' } },
    {
      condition: 'the new password has no digit',
      body: { ...VALID_REQUEST, newPassword: 'new-password' },
    },
    {
      condition: 'the new password is shorter than 8 characters',
      body: { ...VALID_REQUEST, newPassword: 'pass1' },
    },
    {
      condition: 'the new password is longer than 128 characters',
      body: { ...VALID_REQUEST, newPassword: `a1${'a'.repeat(PASSWORD_MAX_LENGTH)}` },
    },
  ])('should reject the request when $condition', ({ body }) => {
    expect(changePasswordRequestSchema.safeParse(body).success).toBe(false);
  });
});
