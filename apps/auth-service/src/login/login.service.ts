import { UnauthorizedError } from '@dexa/common';
import { ErrorCode, type CreateSessionResponse, type LoginRequest } from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import {
  ACCOUNT_REPOSITORY,
  type IAccountRepository,
} from '../accounts/account.repository.interface.js';
import { PASSWORD_HASHER, type IPasswordHasher } from '../credentials/password-hasher.interface.js';
import { DUMMY_PASSWORD_HASH } from './dummy-password-hash.token.js';
import { resolveSignInRole } from './login-eligibility.rules.js';
import type { ILoginService } from './login-service.interface.js';
import {
  USER_TOKEN_LIFETIME_SECONDS,
  USER_TOKEN_SIGNER,
  type IUserTokenSigner,
} from './user-token-signer.interface.js';

// One message for every refusal, so the response never shows whether the email exists or which check
// failed.
const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password.';
const BEARER_TOKEN_TYPE = 'Bearer';

@Injectable()
export class LoginService implements ILoginService {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: IAccountRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: IPasswordHasher,
    @Inject(DUMMY_PASSWORD_HASH) private readonly dummyPasswordHash: string,
    @Inject(USER_TOKEN_SIGNER) private readonly userTokens: IUserTokenSigner,
  ) {}

  async login(request: LoginRequest): Promise<CreateSessionResponse> {
    const account = await this.accounts.findSignInAccountByEmail(request.email);
    // An unknown email still costs one argon2 verification, so the response time does not reveal
    // which emails exist.
    const storedHash = account?.passwordHash ?? this.dummyPasswordHash;
    const isPasswordMatching = await this.passwordHasher.verify(storedHash, request.password);
    // The password is checked before the account state, so an inactive or pending account costs the
    // same as an active one.
    const role = account === undefined ? undefined : resolveSignInRole(account, request.portal);
    if (account === undefined || role === undefined || !isPasswordMatching) {
      throw new UnauthorizedError(ErrorCode.INVALID_CREDENTIALS, INVALID_CREDENTIALS_MESSAGE);
    }
    // The access and refresh tokens are signed together, so one login answers with one consistent pair.
    const [accessToken, refreshToken] = await Promise.all([
      this.userTokens.signAccessToken({ accountId: account.id, role }),
      this.userTokens.signRefreshToken(account.id),
    ]);
    return {
      accessToken,
      refreshToken,
      tokenType: BEARER_TOKEN_TYPE,
      expiresIn: USER_TOKEN_LIFETIME_SECONDS,
      account: { id: account.id, email: account.companyEmail, role },
    };
  }
}
