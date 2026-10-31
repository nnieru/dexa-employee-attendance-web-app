import { Role } from '@dexa/contracts';
import { createSign, randomUUID } from 'node:crypto';
import { USER_JWT_AUDIENCE, USER_JWT_ISSUER, type AuthKeySet } from './auth-key-set.js';

const TOKEN_LIFETIME_SECONDS = 300;

function encodeJsonSegment(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/**
 * Signs a user token the way auth-service does (RS256, the claims the shared guard checks). Only the test holds the
 * private key, so a token minted here is the same as a token from a real sign-in.
 */
export function signUserAccessToken(
  keys: AuthKeySet,
  accountId: string = randomUUID(),
  role: Role = Role.HR,
): string {
  const signingInput = [
    encodeJsonSegment({ alg: 'RS256', typ: 'JWT' }),
    encodeJsonSegment({
      sub: accountId,
      role,
      iss: USER_JWT_ISSUER,
      aud: USER_JWT_AUDIENCE,
      exp: Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECONDS,
    }),
  ].join('.');
  const signature = createSign('RSA-SHA256')
    .update(signingInput)
    .sign(keys.user.privateKeyPem, 'base64url');
  return `${signingInput}.${signature}`;
}
