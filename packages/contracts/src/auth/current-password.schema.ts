import { z } from 'zod';

// Login and the password change check the password the account already has, which may predate the
// policy (T-AUTH-04). The policy in password.schema.ts applies only to new passwords. The bound only
// keeps the argon2 work for one attempt small.
export const CURRENT_PASSWORD_MAX_LENGTH = 1024;

export const currentPasswordSchema = z
  .string()
  .min(1, { error: 'must not be empty' })
  .max(CURRENT_PASSWORD_MAX_LENGTH, {
    error: `must be at most ${CURRENT_PASSWORD_MAX_LENGTH} characters`,
  });
