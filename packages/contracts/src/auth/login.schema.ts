import { z } from 'zod';
import { companyEmailSchema } from './company-email.schema.js';
import { currentAccountSchema } from './current-account.schema.js';
import { currentPasswordSchema } from './current-password.schema.js';
import { Portal } from './portal.js';

// Strict, so a client cannot send an account ID or role along with its credentials.
export const loginRequestSchema = z.strictObject({
  email: companyEmailSchema,
  password: currentPasswordSchema,
  portal: z.enum(Portal),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

// Not strict: a reader that parses a response ignores fields that a later version adds.
export const loginResponseSchema = z.object({
  accessToken: z.string().min(1),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().int().positive(),
  account: currentAccountSchema,
});

export type LoginResponse = z.infer<typeof loginResponseSchema>;

// The answer auth-service gives the gateway for a login or a session refresh. It extends the public
// login response with the refresh token, which the gateway moves into an httpOnly cookie before the
// answer reaches a browser, so the public response shape never carries it.
export const createSessionResponseSchema = loginResponseSchema.extend({
  refreshToken: z.string().min(1),
});

export type CreateSessionResponse = z.infer<typeof createSessionResponseSchema>;
