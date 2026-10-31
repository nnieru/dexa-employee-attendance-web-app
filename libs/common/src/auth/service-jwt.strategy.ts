import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import type { AuthConfig } from '../config/auth-config.schema.js';
import { AUTH_CONFIG } from './auth-config.token.js';
import type { AuthenticatedService } from './authenticated-principal.js';
import {
  createServicePublicKeyProvider,
  extractBearerToken,
  readCallerClaims,
} from './service-jwt-claims.js';
import { SERVICE_JWT_ALGORITHM } from './jwt-algorithm.js';
import { ServiceName } from './service-name.js';

export const SERVICE_JWT_STRATEGY_NAME = 'service-jwt';

/**
 * Verifies service tokens on internal routes. The token's kid selects the caller's public key, so a
 * token signed with another service's key is refused. The audience must be this service, so a token
 * signed for another target is refused even though its signature is valid. A token that carries a user
 * is a user credential, so it is refused here and accepted only by GatewayUserJwtStrategy.
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

  // The request comes first because the caller's kid is read from the same token again.
  validate(request: unknown, payload: unknown): AuthenticatedService {
    const claims = readCallerClaims(request, payload);
    if (claims.user !== undefined) throw new UnauthorizedException();
    return { serviceName: claims.iss };
  }
}
