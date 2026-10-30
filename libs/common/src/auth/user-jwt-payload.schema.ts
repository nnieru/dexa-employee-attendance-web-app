import { roleSchema } from '@dexa/contracts';
import { z } from 'zod';

// passport-jwt has already checked the signature, algorithm, issuer, audience, and expiry when this
// schema runs. exp is still required here: jsonwebtoken skips the expiry check for a token that
// has no exp claim, so such a token would never expire.
export const userJwtPayloadSchema = z.object({
  sub: z.uuid(),
  role: roleSchema,
  exp: z.number(),
});
