import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthConfig } from '../config/auth-config.schema.js';
import { AUTH_CONFIG } from './auth-config.token.js';
import type { AuthenticatedUser } from './authenticated-principal.js';
import { USER_JWT_ALGORITHM } from './jwt-algorithm.js';
import { userJwtPayloadSchema } from './user-jwt-payload.schema.js';

export const USER_JWT_STRATEGY_NAME = 'jwt';

/**
 * Verifies user tokens from the Authorization header. Routes reach it through JwtAuthGuard. Only the
 * public key is loaded here, so a service that holds no private key cannot mint a user token.
 */
@Injectable()
export class UserJwtStrategy extends PassportStrategy(Strategy, USER_JWT_STRATEGY_NAME) {
  constructor(@Inject(AUTH_CONFIG) config: AuthConfig) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.USER_JWT_PUBLIC_KEY,
      algorithms: [USER_JWT_ALGORITHM],
      issuer: config.USER_JWT_ISSUER,
      audience: config.USER_JWT_AUDIENCE,
      ignoreExpiration: false,
    });
  }

  validate(payload: unknown): AuthenticatedUser {
    const claims = userJwtPayloadSchema.safeParse(payload);
    if (!claims.success) throw new UnauthorizedException();
    return { accountId: claims.data.sub, role: claims.data.role };
  }
}
