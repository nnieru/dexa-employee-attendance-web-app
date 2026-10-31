import { Module, type DynamicModule } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import type { UserJwtVerifierConfig } from '../config/auth-config.schema.js';
import { USER_JWT_VERIFIER_CONFIG } from './auth-config.token.js';
import { UserJwtStrategy } from './user-jwt.strategy.js';

/**
 * Registers the strategy that verifies end-user JWTs. Only api-gateway imports it (D-51): every other service
 * accepts the gateway's internal token through GatewayUserAuthGuard instead.
 */
@Module({})
export class UserTokenVerificationModule {
  static forRoot(config: UserJwtVerifierConfig): DynamicModule {
    return {
      module: UserTokenVerificationModule,
      imports: [PassportModule],
      providers: [{ provide: USER_JWT_VERIFIER_CONFIG, useValue: config }, UserJwtStrategy],
    };
  }
}
