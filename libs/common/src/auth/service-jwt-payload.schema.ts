import { z } from 'zod';
import { authenticatedUserSchema } from './authenticated-principal.js';
import { serviceNameSchema } from './service-name.js';

// The signer sets iss and sub to the caller's own name. Requiring them to match rejects a token
// that names one caller as its issuer and another as its subject.
// user is present only on a token that api-gateway signs for a forwarded end-user call (D-51). The
// schema bounds it to a known account ID and role. Which routes accept it is decided by the guards:
// ServiceAuthGuard refuses a token with a user, and GatewayUserAuthGuard requires one.
export const serviceJwtPayloadSchema = z
  .object({
    iss: serviceNameSchema,
    sub: serviceNameSchema,
    exp: z.number(),
    user: authenticatedUserSchema.optional(),
  })
  .refine((claims) => claims.iss === claims.sub, {
    error: 'sub must equal iss',
    path: ['sub'],
  });

export type ServiceJwtClaims = z.infer<typeof serviceJwtPayloadSchema>;
