import { Module, type DynamicModule } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { AuthConfig } from '../config/auth-config.schema.js';
import { AUTH_CONFIG } from './auth-config.token.js';
import { ServiceJwtStrategy } from './service-jwt.strategy.js';
import { ServiceTokenSigner } from './service-token.signer.js';
import { SERVICE_TOKEN_SIGNER } from './service-token-signer.interface.js';
import { UserJwtStrategy } from './user-jwt.strategy.js';

/**
 * Registers the Passport strategies and the service token signer. A service imports it once, with
 * its validated config.
 */
@Module({})
export class AuthModule {
  static forRoot(config: AuthConfig): DynamicModule {
    return {
      module: AuthModule,
      imports: [PassportModule, JwtModule.register({})],
      providers: [
        { provide: AUTH_CONFIG, useValue: config },
        UserJwtStrategy,
        ServiceJwtStrategy,
        { provide: SERVICE_TOKEN_SIGNER, useClass: ServiceTokenSigner },
      ],
      exports: [PassportModule, SERVICE_TOKEN_SIGNER],
    };
  }
}
