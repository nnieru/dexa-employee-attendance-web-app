import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthConfig } from '../config/auth-config.schema.js';
import { AUTH_CONFIG } from './auth-config.token.js';
import type { AuthenticatedUser } from './authenticated-principal.js';
import { SERVICE_JWT_ALGORITHM } from './jwt-algorithm.js';
import { ServiceName } from './service-name.js';
import type { IServiceTokenSigner } from './service-token-signer.interface.js';

// Long enough to cover one internal call, short enough that a leaked token is nearly useless. A stream
// is checked only at connect, so the token does not have to outlive the connection.
export const SERVICE_TOKEN_LIFETIME_SECONDS = 60;

@Injectable()
export class ServiceTokenSigner implements IServiceTokenSigner {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async signFor(audience: ServiceName, onBehalfOf?: AuthenticatedUser): Promise<string> {
    // Only the gateway authenticates end users, so a user claim from any other service would be a forgery.
    if (onBehalfOf !== undefined && this.config.SERVICE_NAME !== ServiceName.API_GATEWAY) {
      throw new Error(`${this.config.SERVICE_NAME} cannot sign a token on behalf of a user.`);
    }
    return this.jwtService.signAsync(buildClaims(onBehalfOf), {
      algorithm: SERVICE_JWT_ALGORITHM,
      privateKey: this.config.SERVICE_JWT_PRIVATE_KEY,
      // The receiver picks this service's public key by kid, so kid must name the key's owner.
      keyid: this.config.SERVICE_NAME,
      issuer: this.config.SERVICE_NAME,
      subject: this.config.SERVICE_NAME,
      audience,
      expiresIn: SERVICE_TOKEN_LIFETIME_SECONDS,
    });
  }
}

// Copies the two claims, so no other field of the caller's object can reach the token.
function buildClaims(onBehalfOf: AuthenticatedUser | undefined): { user?: AuthenticatedUser } {
  if (onBehalfOf === undefined) return {};
  return { user: { accountId: onBehalfOf.accountId, role: onBehalfOf.role } };
}
