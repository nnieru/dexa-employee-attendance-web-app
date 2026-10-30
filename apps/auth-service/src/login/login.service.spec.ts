import { UnauthorizedError } from '@dexa/common';
import { ErrorCode, Portal, Role, type LoginRequest } from '@dexa/contracts';
import type {
  IAccountRepository,
  SignInAccountRecord,
} from '../accounts/account.repository.interface.js';
import type { IPasswordHasher } from '../credentials/password-hasher.interface.js';
import { LoginService } from './login.service.js';
import {
  USER_TOKEN_LIFETIME_SECONDS,
  type IUserTokenSigner,
  type UserTokenSubject,
} from './user-token-signer.interface.js';

const ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
const COMPANY_EMAIL = 'nadia.rahma@dexa.test';
const PASSWORD = 'employee-pass-1';
const DUMMY_HASH = 'hash-of-a-value-nobody-holds';
const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password.';

// The fake hasher stores the password inside the hash, so "verify" means "the password matches".
function hashOf(password: string): string {
  return `hash:${password}`;
}

function fakeAccount(overrides: Partial<SignInAccountRecord> = {}): SignInAccountRecord {
  return {
    id: ACCOUNT_ID,
    companyEmail: COMPANY_EMAIL,
    passwordHash: hashOf(PASSWORD),
    roleCode: Role.EMPLOYEE,
    isActive: true,
    isProvisioningPending: false,
    ...overrides,
  };
}

// Behaves like the database lookup: the email matches without regard to letter case.
function fakeAccountRepository(accounts: ReadonlyArray<SignInAccountRecord>): IAccountRepository {
  return {
    hasAccountWithRole: notUsedByLogin,
    findAccountById: notUsedByLogin,
    runExclusiveTransaction: notUsedByLogin,
    findSignInAccountByEmail: (companyEmail) =>
      Promise.resolve(
        accounts.find((account) => account.companyEmail === companyEmail.toLowerCase()),
      ),
  };
}

function notUsedByLogin(): never {
  throw new Error('LoginService does not call this repository method.');
}

class RecordingPasswordHasher implements IPasswordHasher {
  readonly verifiedHashes: string[] = [];

  hash(password: string): Promise<string> {
    return Promise.resolve(hashOf(password));
  }

  verify(hash: string, password: string): Promise<boolean> {
    this.verifiedHashes.push(hash);
    return Promise.resolve(hash === hashOf(password));
  }
}

class RecordingTokenSigner implements IUserTokenSigner {
  readonly subjects: UserTokenSubject[] = [];

  signAccessToken(subject: UserTokenSubject): Promise<string> {
    this.subjects.push(subject);
    return Promise.resolve(`token:${subject.accountId}:${subject.role}`);
  }
}

function createService(
  accounts: ReadonlyArray<SignInAccountRecord>,
  hasher: RecordingPasswordHasher,
  signer: RecordingTokenSigner,
): LoginService {
  return new LoginService(fakeAccountRepository(accounts), hasher, DUMMY_HASH, signer);
}

function loginRequest(overrides: Partial<LoginRequest> = {}): LoginRequest {
  return { email: COMPANY_EMAIL, password: PASSWORD, portal: Portal.EMPLOYEE, ...overrides };
}

describe('LoginService', () => {
  it('should return a bearer session for the account when the password matches and the portal accepts the role', async () => {
    const service = createService(
      [fakeAccount()],
      new RecordingPasswordHasher(),
      new RecordingTokenSigner(),
    );

    const session = await service.login(loginRequest());

    expect(session).toEqual({
      accessToken: `token:${ACCOUNT_ID}:${Role.EMPLOYEE}`,
      tokenType: 'Bearer',
      expiresIn: USER_TOKEN_LIFETIME_SECONDS,
      account: { id: ACCOUNT_ID, email: COMPANY_EMAIL, role: Role.EMPLOYEE },
    });
  });

  it('should verify against the dummy hash and refuse with INVALID_CREDENTIALS when the email is unknown', async () => {
    const hasher = new RecordingPasswordHasher();
    const signer = new RecordingTokenSigner();
    const service = createService([], hasher, signer);

    await expect(service.login(loginRequest())).rejects.toMatchObject({
      code: ErrorCode.INVALID_CREDENTIALS,
      message: INVALID_CREDENTIALS_MESSAGE,
    });
    expect(hasher.verifiedHashes).toEqual([DUMMY_HASH]);
    expect(signer.subjects).toEqual([]);
  });

  it('should refuse with INVALID_CREDENTIALS when the password does not match', async () => {
    const hasher = new RecordingPasswordHasher();
    const signer = new RecordingTokenSigner();
    const service = createService([fakeAccount()], hasher, signer);

    const refusal = service.login(loginRequest({ password: 'wrong-pass-9' }));

    await expect(refusal).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(refusal).rejects.toMatchObject({ code: ErrorCode.INVALID_CREDENTIALS });
    expect(hasher.verifiedHashes).toEqual([hashOf(PASSWORD)]);
    expect(signer.subjects).toEqual([]);
  });

  it.each([
    {
      condition: 'the account is inactive',
      account: fakeAccount({ isActive: false }),
      portal: Portal.EMPLOYEE,
    },
    {
      condition: 'the account is still pending provisioning',
      account: fakeAccount({ isProvisioningPending: true }),
      portal: Portal.EMPLOYEE,
    },
    {
      condition: 'an EMPLOYEE account signs in on the HR portal',
      account: fakeAccount({ roleCode: Role.EMPLOYEE }),
      portal: Portal.HR,
    },
  ])(
    'should refuse with the same INVALID_CREDENTIALS error and issue no token when $condition',
    async ({ account, portal }) => {
      const signer = new RecordingTokenSigner();
      const service = createService([account], new RecordingPasswordHasher(), signer);

      await expect(service.login(loginRequest({ portal }))).rejects.toMatchObject({
        code: ErrorCode.INVALID_CREDENTIALS,
        message: INVALID_CREDENTIALS_MESSAGE,
      });
      expect(signer.subjects).toEqual([]);
    },
  );
});
