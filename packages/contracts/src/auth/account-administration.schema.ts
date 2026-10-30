import { z } from 'zod';
import { accountIdSchema } from './account-lookup.schema.js';
import { passwordSchema } from './password.schema.js';

// Strict, so a caller cannot send a role, an email, or a timestamp that the server must decide itself. The
// target account is the path parameter. The actor is the HR account that employee-service has authorized.
export const resetAccountPasswordRequestSchema = z.strictObject({
  actorAccountId: accountIdSchema,
  newPassword: passwordSchema,
});

export type ResetAccountPasswordRequest = z.infer<typeof resetAccountPasswordRequestSchema>;

export const setAccountActiveStatusRequestSchema = z.strictObject({
  actorAccountId: accountIdSchema,
  isActive: z.boolean(),
});

export type SetAccountActiveStatusRequest = z.infer<typeof setAccountActiveStatusRequestSchema>;
