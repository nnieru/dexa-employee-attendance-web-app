import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthConfig } from '../config/auth-config.schema.js';
import { AUTH_CONFIG } from './auth-config.token.js';
import { SERVICE_JWT_ALGORITHM } from './jwt-algorithm.js';
import type { ServiceName } from './service-name.js';
import type { IServiceTokenSigner } from './service-token-signer.interface.js';

// Long enough to cover one internal call, short enough that a leaked token is nearly useless.
const SERVICE_TOKEN_LIFETIME_SECONDS = 60;

@Injectable()
export class ServiceTokenSigner implements IServiceTokenSigner {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  signFor(audience: ServiceName): Promise<string> {
    return this.jwtService.signAsync(
      {},
      {
        algorithm: SERVICE_JWT_ALGORITHM,
        privateKey: this.config.SERVICE_JWT_PRIVATE_KEY,
        // The receiver picks this service's public key by kid, so kid must name the key's owner.
        keyid: this.config.SERVICE_NAME,
        issuer: this.config.SERVICE_NAME,
        subject: this.config.SERVICE_NAME,
        audience,
        expiresIn: SERVICE_TOKEN_LIFETIME_SECONDS,
      },
    );
  }
}
