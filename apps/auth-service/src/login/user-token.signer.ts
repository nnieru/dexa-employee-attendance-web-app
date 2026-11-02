import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { REFRESH_TOKEN_LIFETIME_SECONDS } from '@dexa/contracts';
import type { AuthServiceConfig } from '../config/auth-service-config.schema.js';
import { CONFIG } from '../config/config.token.js';
import {
  USER_TOKEN_LIFETIME_SECONDS,
  type IUserTokenSigner,
  type UserTokenSubject,
} from './user-token-signer.interface.js';

// Must equal USER_JWT_ALGORITHM in @dexa/common, which every verifier pins. A different value here
// would make every token fail verification.
const USER_TOKEN_ALGORITHM = 'RS256';

// Separates refresh tokens from access tokens, so a refresh token can never be presented as an
// access token and vice versa, even though one key pair signs both.
const REFRESH_TOKEN_TYPE = 'refresh';

@Injectable()
export class UserTokenSigner implements IUserTokenSigner {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(CONFIG) private readonly config: AuthServiceConfig,
  ) {}

  signAccessToken(subject: UserTokenSubject): Promise<string> {
    return this.jwtService.signAsync(
      { role: subject.role },
      {
        algorithm: USER_TOKEN_ALGORITHM,
        privateKey: this.config.USER_JWT_PRIVATE_KEY,
        subject: subject.accountId,
        issuer: this.config.USER_JWT_ISSUER,
        audience: this.config.USER_JWT_AUDIENCE,
        expiresIn: USER_TOKEN_LIFETIME_SECONDS,
      },
    );
  }

  signRefreshToken(accountId: string): Promise<string> {
    return this.jwtService.signAsync(
      // A random jti makes every refresh token distinct, so a rotated token is visibly different
      // from the one that produced the session, even when both were minted in the same second.
      { typ: REFRESH_TOKEN_TYPE, jti: randomUUID() },
      {
        algorithm: USER_TOKEN_ALGORITHM,
        privateKey: this.config.USER_JWT_PRIVATE_KEY,
        subject: accountId,
        issuer: this.config.USER_JWT_ISSUER,
        audience: this.config.USER_JWT_AUDIENCE,
        expiresIn: REFRESH_TOKEN_LIFETIME_SECONDS,
      },
    );
  }
}
