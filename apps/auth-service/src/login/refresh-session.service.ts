import { UnauthorizedError } from '@dexa/common';
import { ErrorCode, type CreateSessionResponse } from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import {
  ACCOUNT_REPOSITORY,
  type IAccountRepository,
} from '../accounts/account.repository.interface.js';
import { findKnownRole } from './login-eligibility.rules.js';
import type { IRefreshSessionService } from './refresh-session-service.interface.js';
import {
  USER_TOKEN_LIFETIME_SECONDS,
  USER_TOKEN_SIGNER,
  type IUserTokenSigner,
  type UserTokenSubject,
} from './user-token-signer.interface.js';
import { USER_TOKEN_VERIFIER, type IUserTokenVerifier } from './user-token-verifier.interface.js';

const BEARER_TOKEN_TYPE = 'Bearer';
const INVALID_REFRESH_TOKEN_MESSAGE = 'Sign in to continue.';
const ACCOUNT_DISABLED_MESSAGE = 'Your account has been deactivated.';

/**
 * Exchanges a refresh token for a fresh session. The account is read from the database, so a
 * deactivation or a role change takes effect on the next refresh (AUTH-5, D-13) even though the
 * refresh token itself is stateless and lives until it expires.
 */
@Injectable()
export class RefreshSessionService implements IRefreshSessionService {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: IAccountRepository,
    @Inject(USER_TOKEN_VERIFIER) private readonly tokenVerifier: IUserTokenVerifier,
    @Inject(USER_TOKEN_SIGNER) private readonly userTokens: IUserTokenSigner,
  ) {}

  async refreshSession(refreshToken: string): Promise<CreateSessionResponse> {
    const { accountId } = await this.tokenVerifier.verifyRefreshToken(refreshToken);
    const account = await this.accounts.findAccountById(accountId);
    // The disabled account is named, because its user is already authenticated and must be told to
    // stop; every other refusal stays generic (AUTH-4).
    if (account === undefined || !account.isActive || account.isProvisioningPending) {
      if (account !== undefined && !account.isActive) {
        throw new UnauthorizedError(ErrorCode.ACCOUNT_DISABLED, ACCOUNT_DISABLED_MESSAGE);
      }
      throw new UnauthorizedError(ErrorCode.UNAUTHORIZED, INVALID_REFRESH_TOKEN_MESSAGE);
    }
    const role = findKnownRole(account.roleCode);
    if (role === undefined)
      throw new UnauthorizedError(ErrorCode.UNAUTHORIZED, INVALID_REFRESH_TOKEN_MESSAGE);

    const subject: UserTokenSubject = { accountId: account.id, role };
    const [accessToken, nextRefreshToken] = await Promise.all([
      this.userTokens.signAccessToken(subject),
      this.userTokens.signRefreshToken(account.id),
    ]);
    return {
      accessToken,
      refreshToken: nextRefreshToken,
      tokenType: BEARER_TOKEN_TYPE,
      expiresIn: USER_TOKEN_LIFETIME_SECONDS,
      account: { id: account.id, email: account.companyEmail, role },
    };
  }
}
