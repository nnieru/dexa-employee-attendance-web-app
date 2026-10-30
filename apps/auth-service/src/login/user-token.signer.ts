import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
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
}
