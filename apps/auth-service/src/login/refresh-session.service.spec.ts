import { ErrorCode, Role } from '@dexa/contracts';
import type {
  IAccountRepository,
  AccountRecord,
} from '../accounts/account.repository.interface.js';
import { RefreshSessionService } from './refresh-session.service.js';
import type { IUserTokenSigner } from './user-token-signer.interface.js';
import type { IUserTokenVerifier } from './user-token-verifier.interface.js';

const ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
const COMPANY_EMAIL = 'nadia.rahma@dexa.test';
const OLD_REFRESH_TOKEN = 'refresh-token-1';
const INVALID_REFRESH_TOKEN_MESSAGE = 'Sign in to continue.';
const ACCOUNT_DISABLED_MESSAGE = 'Your account has been deactivated.';

function fakeAccount(overrides: Partial<AccountRecord> = {}): AccountRecord {
  return {
    id: ACCOUNT_ID,
    companyEmail: COMPANY_EMAIL,
    roleCode: Role.EMPLOYEE,
    isActive: true,
    isProvisioningPending: false,
    ...overrides,
  };
}

function fakeRepository(account: AccountRecord | undefined): IAccountRepository {
  return {
    hasAccountWithRole: notUsedByRefresh,
    findSignInAccountByEmail: notUsedByRefresh,
    runExclusiveTransaction: notUsedByRefresh,
    findAccountById: (id) =>
      Promise.resolve(account !== undefined && id === account.id ? account : undefined),
  };
}

function notUsedByRefresh(): never {
  throw new Error('RefreshSessionService does not call this repository method.');
}

class StubTokenVerifier implements IUserTokenVerifier {
  constructor(private readonly accountId: Promise<string>) {}

  verifyRefreshToken(): Promise<{ readonly accountId: string }> {
    return this.accountId.then((accountId) => ({ accountId }));
  }
}

class StubTokenSigner implements IUserTokenSigner {
  signAccessToken(subject: { readonly accountId: string; readonly role: Role }): Promise<string> {
    return Promise.resolve(`token:${subject.accountId}:${subject.role}`);
  }

  signRefreshToken(accountId: string): Promise<string> {
    return Promise.resolve(`refresh:${accountId}`);
  }
}

function createService(
  account: AccountRecord | undefined,
  verifier: StubTokenVerifier,
): RefreshSessionService {
  return new RefreshSessionService(fakeRepository(account), verifier, new StubTokenSigner());
}

describe('RefreshSessionService', () => {
  it('should answer a fresh session with the role read now when the account is active', async () => {
    const service = createService(
      fakeAccount(),
      new StubTokenVerifier(Promise.resolve(ACCOUNT_ID)),
    );

    const session = await service.refreshSession(OLD_REFRESH_TOKEN);

    expect(session).toEqual({
      accessToken: `token:${ACCOUNT_ID}:${Role.EMPLOYEE}`,
      refreshToken: `refresh:${ACCOUNT_ID}`,
      tokenType: 'Bearer',
      expiresIn: 3600,
      account: { id: ACCOUNT_ID, email: COMPANY_EMAIL, role: Role.EMPLOYEE },
    });
  });

  it('should answer with the role that the account has now, not one stored in the token', async () => {
    const service = createService(
      fakeAccount({ roleCode: Role.HR }),
      new StubTokenVerifier(Promise.resolve(ACCOUNT_ID)),
    );

    const session = await service.refreshSession(OLD_REFRESH_TOKEN);

    expect(session.account.role).toBe(Role.HR);
  });

  it('should refuse with UNAUTHORIZED when the account no longer exists', async () => {
    const service = createService(undefined, new StubTokenVerifier(Promise.resolve(ACCOUNT_ID)));

    await expect(service.refreshSession(OLD_REFRESH_TOKEN)).rejects.toMatchObject({
      code: ErrorCode.UNAUTHORIZED,
      message: INVALID_REFRESH_TOKEN_MESSAGE,
    });
  });

  it('should refuse with ACCOUNT_DISABLED when the account is inactive', async () => {
    const service = createService(
      fakeAccount({ isActive: false }),
      new StubTokenVerifier(Promise.resolve(ACCOUNT_ID)),
    );

    await expect(service.refreshSession(OLD_REFRESH_TOKEN)).rejects.toMatchObject({
      code: ErrorCode.ACCOUNT_DISABLED,
      message: ACCOUNT_DISABLED_MESSAGE,
    });
  });

  it('should refuse with UNAUTHORIZED when the account is still pending provisioning', async () => {
    const service = createService(
      fakeAccount({ isProvisioningPending: true }),
      new StubTokenVerifier(Promise.resolve(ACCOUNT_ID)),
    );

    await expect(service.refreshSession(OLD_REFRESH_TOKEN)).rejects.toMatchObject({
      code: ErrorCode.UNAUTHORIZED,
      message: INVALID_REFRESH_TOKEN_MESSAGE,
    });
  });

  it('should refuse with UNAUTHORIZED when the account role code is unknown', async () => {
    const service = createService(
      fakeAccount({ roleCode: 'SOMETHING_ELSE' }),
      new StubTokenVerifier(Promise.resolve(ACCOUNT_ID)),
    );

    await expect(service.refreshSession(OLD_REFRESH_TOKEN)).rejects.toMatchObject({
      code: ErrorCode.UNAUTHORIZED,
      message: INVALID_REFRESH_TOKEN_MESSAGE,
    });
  });
});
