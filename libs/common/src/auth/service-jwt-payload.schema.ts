import { z } from 'zod';
import { serviceNameSchema } from './service-name.js';

// The signer sets iss and sub to the caller's own name. Requiring them to match rejects a token
// that names one caller as its issuer and another as its subject.
export const serviceJwtPayloadSchema = z
  .object({
    iss: serviceNameSchema,
    sub: serviceNameSchema,
    exp: z.number(),
  })
  .refine((claims) => claims.iss === claims.sub, {
    error: 'sub must equal iss',
    path: ['sub'],
  });
