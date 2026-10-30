import { z } from 'zod';
import { currentAccountSchema } from './current-account.schema.js';
import { Portal } from './portal.js';

// Matches accounts.company_email, varchar(254) in DATABASE §3.
const EMAIL_MAX_LENGTH = 254;
// Login does not apply the password policy, because a password set before the policy must still work
// (T-AUTH-04). The bound only keeps the work done for one attempt small.
const LOGIN_PASSWORD_MAX_LENGTH = 1024;

// Strict, so a client cannot send an account ID or role along with its credentials.
export const loginRequestSchema = z.strictObject({
  email: z
    .string()
    .trim()
    .max(EMAIL_MAX_LENGTH, { error: `must be at most ${EMAIL_MAX_LENGTH} characters` })
    .pipe(z.email({ error: 'must be an email address' })),
  password: z
    .string()
    .min(1, { error: 'must not be empty' })
    .max(LOGIN_PASSWORD_MAX_LENGTH, {
      error: `must be at most ${LOGIN_PASSWORD_MAX_LENGTH} characters`,
    }),
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
