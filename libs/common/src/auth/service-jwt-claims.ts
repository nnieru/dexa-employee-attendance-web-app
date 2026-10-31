import { UnauthorizedException } from '@nestjs/common';
import { ExtractJwt, type SecretOrKeyProvider } from 'passport-jwt';
import type { AuthConfig } from '../config/auth-config.schema.js';
import { readServiceTokenKid } from './read-service-token-kid.js';
import { serviceJwtPayloadSchema, type ServiceJwtClaims } from './service-jwt-payload.schema.js';

/** Reads the bearer token from the Authorization header, as passport-jwt's jwtFromRequest expects. */
export const extractBearerToken = ExtractJwt.fromAuthHeaderAsBearerToken();

/**
 * Checks the claims of a service token after passport-jwt has verified its signature, algorithm, audience, and
 * expiry. The kid must name the issuer: without that check, a key holder could sign under another service's name,
 * because the signature only proves who holds the key that the kid names.
 */
export function readCallerClaims(request: unknown, payload: unknown): ServiceJwtClaims {
  const claims = serviceJwtPayloadSchema.safeParse(payload);
  if (!claims.success) throw new UnauthorizedException();
  if (readServiceTokenKid(extractBearerToken(request)) !== claims.data.iss) {
    throw new UnauthorizedException();
  }
  return claims.data;
}

// passport-jwt asks for the key before any signature check. A token whose kid is missing or unknown
// gets no key at all, so its signature is never tested against an arbitrary key.
export function createServicePublicKeyProvider(config: AuthConfig): SecretOrKeyProvider {
  return (_request, rawToken, done) => {
    const kid = readServiceTokenKid(rawToken);
    const publicKey = kid === undefined ? undefined : config.SERVICE_JWT_PUBLIC_KEYS.get(kid);
    if (publicKey === undefined) return done(new UnauthorizedException());
    return done(null, publicKey);
  };
}
