import { Buffer } from 'node:buffer';
import { createVerify } from 'node:crypto';
import { ServiceName, type AuthenticatedUser } from '@dexa/common';
import { roleSchema } from '@dexa/contracts';
import { z } from 'zod';
import { servicePair, type AuthKeySet } from './auth-key-set.js';

// The longest lifetime a token from api-gateway may have.
export const GATEWAY_TOKEN_MAX_LIFETIME_SECONDS = 60;

const gatewayUserClaimsSchema = z.object({
  iss: z.literal(ServiceName.API_GATEWAY),
  sub: z.literal(ServiceName.API_GATEWAY),
  aud: z.string(),
  iat: z.number(),
  exp: z.number(),
  user: z.object({ accountId: z.uuid(), role: roleSchema }),
});

/**
 * Checks a token the way a service does, using only api-gateway's public key: the ES256 signature, the issuer and
 * subject, the audience, the lifetime, and the user claim. Returns the user that the token names. Throws when any
 * check fails, so a test that expects a token to be accepted fails with the reason.
 */
export function verifyGatewayToken(
  keys: AuthKeySet,
  authorization: string | undefined,
  target: ServiceName,
): AuthenticatedUser {
  const [encodedHeader = '', encodedPayload = '', signature = ''] = (authorization ?? '')
    .replace(/^Bearer /, '')
    .split('.');
  const isSigned = createVerify('SHA256')
    .update(`${encodedHeader}.${encodedPayload}`)
    .verify(
      { key: servicePair(keys, ServiceName.API_GATEWAY).publicKeyPem, dsaEncoding: 'ieee-p1363' },
      signature,
      'base64url',
    );
  if (!isSigned) throw new Error('The token was not signed by api-gateway.');
  const claims = gatewayUserClaimsSchema.parse(
    JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')),
  );
  if (claims.aud !== target) throw new Error('The token is addressed to another service.');
  if (claims.exp - claims.iat > GATEWAY_TOKEN_MAX_LIFETIME_SECONDS) {
    throw new Error('The token lives longer than 60 seconds.');
  }
  return { accountId: claims.user.accountId, role: claims.user.role };
}
