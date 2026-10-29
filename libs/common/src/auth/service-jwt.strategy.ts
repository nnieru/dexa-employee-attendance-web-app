import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, type SecretOrKeyProvider } from 'passport-jwt';
import type { AuthConfig } from '../config/auth-config.schema.js';
import { AUTH_CONFIG } from './auth-config.token.js';
import type { AuthenticatedService } from './authenticated-principal.js';
import { SERVICE_JWT_ALGORITHM } from './jwt-algorithm.js';
import { readServiceTokenKid } from './read-service-token-kid.js';
import { serviceJwtPayloadSchema } from './service-jwt-payload.schema.js';
import { ServiceName } from './service-name.js';

export const SERVICE_JWT_STRATEGY_NAME = 'service-jwt';

const extractBearerToken = ExtractJwt.fromAuthHeaderAsBearerToken();

/**
 * Verifies service tokens on internal routes. The token's kid selects the caller's public key, so a
 * token signed with another service's key is refused. The audience must be this service, so a token
 * signed for another target is refused even though its signature is valid.
 */
@Injectable()
export class ServiceJwtStrategy extends PassportStrategy(Strategy, SERVICE_JWT_STRATEGY_NAME) {
  constructor(@Inject(AUTH_CONFIG) config: AuthConfig) {
    super({
      jwtFromRequest: extractBearerToken,
      secretOrKeyProvider: createServicePublicKeyProvider(config),
      algorithms: [SERVICE_JWT_ALGORITHM],
      issuer: Object.values(ServiceName),
      audience: config.SERVICE_NAME,
      ignoreExpiration: false,
      passReqToCallback: true,
    });
  }

  // The request comes first because the caller's kid is read from the same token again. The kid
  // here is authenticated: the signature was already checked with the key that this kid selected.
  validate(request: unknown, payload: unknown): AuthenticatedService {
    const claims = serviceJwtPayloadSchema.safeParse(payload);
    if (!claims.success) throw new UnauthorizedException();
    // Without this check, a key holder could sign under another service's name, because the
    // signature only proves who holds the key that the kid names.
    if (readServiceTokenKid(extractBearerToken(request)) !== claims.data.iss) {
      throw new UnauthorizedException();
    }
    return { serviceName: claims.data.iss };
  }
}

// passport-jwt asks for the key before any signature check. A token whose kid is missing or unknown
// gets no key at all, so its signature is never tested against an arbitrary key.
function createServicePublicKeyProvider(config: AuthConfig): SecretOrKeyProvider {
  return (_request, rawToken, done) => {
    const kid = readServiceTokenKid(rawToken);
    const publicKey = kid === undefined ? undefined : config.SERVICE_JWT_PUBLIC_KEYS.get(kid);
    if (publicKey === undefined) return done(new UnauthorizedException());
    return done(null, publicKey);
  };
}
