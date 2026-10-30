import { z } from 'zod';
import { currentPasswordSchema } from './current-password.schema.js';
import { passwordSchema } from './password.schema.js';

// Strict, so a client cannot send an account ID or a role along with the passwords.
export const changePasswordRequestSchema = z.strictObject({
  currentPassword: currentPasswordSchema,
  newPassword: passwordSchema,
});

export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
