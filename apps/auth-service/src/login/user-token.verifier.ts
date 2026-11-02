import { UnauthorizedError } from '@dexa/common';
import { ErrorCode } from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { z } from 'zod';
import type { AuthServiceConfig } from '../config/auth-service-config.schema.js';
import { CONFIG } from '../config/config.token.js';
import {
  type IUserTokenVerifier,
  type RefreshTokenSubject,
} from './user-token-verifier.interface.js';

// Must equal USER_TOKEN_ALGORITHM in the signer and USER_JWT_ALGORITHM in @dexa/common.
const USER_TOKEN_ALGORITHM = 'RS256';
const REFRESH_TOKEN_TYPE = 'refresh';
const INVALID_REFRESH_TOKEN_MESSAGE = 'Sign in to continue.';

// A refresh token carries its type, subject, and the standard claims the verifier checks (iss, aud,
// iat, exp); a role claim or an access-token payload marks a forged or mistaken token.
const REFRESH_TOKEN_CLAIMS_SCHEMA = z.object({
  typ: z.literal(REFRESH_TOKEN_TYPE),
  sub: z.uuid(),
});

@Injectable()
export class UserTokenVerifier implements IUserTokenVerifier {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(CONFIG) private readonly config: AuthServiceConfig,
  ) {}

  async verifyRefreshToken(token: string): Promise<RefreshTokenSubject> {
    try {
      const claims = await this.jwtService.verifyAsync<Record<string, unknown>>(token, {
        algorithms: [USER_TOKEN_ALGORITHM],
        publicKey: this.config.USER_JWT_PUBLIC_KEY,
        issuer: this.config.USER_JWT_ISSUER,
        audience: this.config.USER_JWT_AUDIENCE,
      });
      const parsed = REFRESH_TOKEN_CLAIMS_SCHEMA.safeParse(claims);
      if (!parsed.success) throw new Error('The token claims do not match a refresh token.');
      return { accountId: parsed.data.sub };
    } catch {
      // One refusal for every malformed, expired, or wrongly typed token, so the answer reveals
      // nothing about which check failed.
      throw new UnauthorizedError(ErrorCode.UNAUTHORIZED, INVALID_REFRESH_TOKEN_MESSAGE);
    }
  }
}
