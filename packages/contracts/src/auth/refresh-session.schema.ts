import { z } from 'zod';

// A refresh token outlives the one-hour access token (login.schema reports that lifetime) so a
// browser reload or an expired access token can start a new session without credentials, but only
// within one working day. auth-service signs it and the gateway mirrors it as the cookie's max age.
export const REFRESH_TOKEN_LIFETIME_SECONDS = 8 * 60 * 60;

// Strict, so a caller cannot smuggle an account ID or role along with the token. The account is
// resolved server-side from the token's subject, never from this body.
export const refreshSessionRequestSchema = z.strictObject({
  refreshToken: z.string().min(1),
});

export type RefreshSessionRequest = z.infer<typeof refreshSessionRequestSchema>;
