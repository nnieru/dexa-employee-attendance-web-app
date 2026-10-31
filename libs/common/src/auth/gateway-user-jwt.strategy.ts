import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { z } from 'zod';
import type { AuthConfig } from '../config/auth-config.schema.js';
import { AUTH_CONFIG } from './auth-config.token.js';
import type { AuthenticatedUser } from './authenticated-principal.js';
import { SERVICE_JWT_ALGORITHM } from './jwt-algorithm.js';
import {
  createServicePublicKeyProvider,
  extractBearerToken,
  readCallerClaims,
} from './service-jwt-claims.js';
import { ServiceName } from './service-name.js';
import { SERVICE_TOKEN_LIFETIME_SECONDS } from './service-token.signer.js';

export const GATEWAY_USER_JWT_STRATEGY_NAME = 'gateway-user-jwt';

// Tolerates small clock drift between the gateway and this service when checking iat.
export const GATEWAY_TOKEN_CLOCK_SKEW_SECONDS = 30;

const tokenTimesSchema = z.object({ iat: z.number().int(), exp: z.number().int() });

/**
 * The verifier caps the lifetime itself instead of trusting the signer's exp: a token must carry iat, live no longer
 * than SERVICE_TOKEN_LIFETIME_SECONDS, and not be issued in the future beyond the clock skew. Without the iat bound,
 * a token issued far ahead with exp = iat + 60 would stay valid until then.
 */
export function isWithinGatewayTokenLifetime(payload: unknown, nowSeconds: number): boolean {
  const times = tokenTimesSchema.safeParse(payload);
  if (!times.success) return false;
  const { iat, exp } = times.data;
  if (exp - iat > SERVICE_TOKEN_LIFETIME_SECONDS) return false;
  return iat <= nowSeconds + GATEWAY_TOKEN_CLOCK_SKEW_SECONDS;
}

/**
 * Accepts only a token that api-gateway signed for this service on behalf of an end user (D-51). The user
 * JWT itself never reaches a service, so this strategy is the only way a service learns who the caller is.
 * The issuer must be api-gateway and the audience must be this service, so a token addressed to another
 * service is refused even when its signature is valid.
 */
@Injectable()
export class GatewayUserJwtStrategy extends PassportStrategy(
  Strategy,
  GATEWAY_USER_JWT_STRATEGY_NAME,
) {
  constructor(@Inject(AUTH_CONFIG) config: AuthConfig) {
    super({
      jwtFromRequest: extractBearerToken,
      secretOrKeyProvider: createServicePublicKeyProvider(config),
      algorithms: [SERVICE_JWT_ALGORITHM],
      issuer: ServiceName.API_GATEWAY,
      audience: config.SERVICE_NAME,
      ignoreExpiration: false,
      passReqToCallback: true,
    });
  }

  validate(request: unknown, payload: unknown): AuthenticatedUser {
    const claims = readCallerClaims(request, payload);
    if (claims.iss !== ServiceName.API_GATEWAY || claims.user === undefined) {
      throw new UnauthorizedException();
    }
    // Wall-clock time is right here: this is transport authentication, and passport-jwt checks exp the same way.
    if (!isWithinGatewayTokenLifetime(payload, Math.floor(Date.now() / 1000))) {
      throw new UnauthorizedException();
    }
    return { accountId: claims.user.accountId, role: claims.user.role };
  }
}
