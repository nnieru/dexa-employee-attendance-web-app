import { jest } from '@jest/globals';
import type { ExecutionContext } from '@nestjs/common';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host.js';
import { ErrorCode, Role } from '@dexa/contracts';
import { DependencyUnavailableError } from '../errors/domain.errors.js';
import type { IAccountStatusReader } from './account-status-reader.interface.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

const ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
const SIGN_IN_MESSAGE = 'Sign in to continue.';
const ACCOUNT_DISABLED_MESSAGE = 'This account is no longer active.';

// The guard inherits canActivate from the passport mixin. The mixin class is the prototype one level up,
// and the test replaces its method so the token step returns what passport would have produced.
type PassportGuardPrototype = { canActivate(context: ExecutionContext): Promise<boolean> };
const passportGuardPrototype = Object.getPrototypeOf(
  JwtAuthGuard.prototype,
) as PassportGuardPrototype;

const validUser = { accountId: ACCOUNT_ID, role: Role.EMPLOYEE };

function contextFor(request: { user?: unknown }): ExecutionContext {
  return new ExecutionContextHost([request]);
}

describe('JwtAuthGuard account status', () => {
  let passportOutcome: { readonly isVerified: boolean; readonly user?: unknown };
  let findAccountStatus: jest.Mock<IAccountStatusReader['findAccountStatus']>;
  let guard: JwtAuthGuard;

  beforeEach(() => {
    passportOutcome = { isVerified: true, user: validUser };
    jest.spyOn(passportGuardPrototype, 'canActivate').mockImplementation((context) => {
      const request = context.switchToHttp().getRequest<{ user?: unknown }>();
      if (passportOutcome.isVerified) request.user = passportOutcome.user;
      return Promise.resolve(passportOutcome.isVerified);
    });
    findAccountStatus = jest.fn();
    guard = new JwtAuthGuard({ findAccountStatus });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should allow the request and read the status of the token account when the account is active', async () => {
    findAccountStatus.mockResolvedValue({ isActive: true });

    await expect(guard.canActivate(contextFor({}))).resolves.toBe(true);
    expect(findAccountStatus).toHaveBeenCalledTimes(1);
    expect(findAccountStatus).toHaveBeenCalledWith(ACCOUNT_ID);
  });

  it.each([
    {
      condition: 'the account is deactivated',
      status: { isActive: false },
      code: ErrorCode.ACCOUNT_DISABLED,
      message: ACCOUNT_DISABLED_MESSAGE,
    },
    {
      condition: 'the account no longer exists',
      status: undefined,
      code: ErrorCode.UNAUTHORIZED,
      message: SIGN_IN_MESSAGE,
    },
  ])('should refuse the request with $code when $condition', async ({ status, code, message }) => {
    findAccountStatus.mockResolvedValue(status);

    await expect(guard.canActivate(contextFor({}))).rejects.toMatchObject({
      kind: 'unauthorized',
      code,
      message,
    });
  });

  it('should propagate the reader error and never allow the request when auth-service is unavailable', async () => {
    const outage = new DependencyUnavailableError(
      ErrorCode.DEPENDENCY_UNAVAILABLE,
      'A dependent service is unavailable. Try again shortly.',
    );
    findAccountStatus.mockRejectedValue(outage);

    await expect(guard.canActivate(contextFor({}))).rejects.toBe(outage);
  });

  it.each([
    { condition: 'the token user has no account ID', user: { role: Role.HR } },
    { condition: 'the token user is absent', user: undefined },
  ])('should refuse with UNAUTHORIZED without reading status when $condition', async ({ user }) => {
    passportOutcome = { isVerified: true, user };

    await expect(guard.canActivate(contextFor({}))).rejects.toMatchObject({
      code: ErrorCode.UNAUTHORIZED,
      message: SIGN_IN_MESSAGE,
    });
    expect(findAccountStatus).not.toHaveBeenCalled();
  });

  it('should return false without reading status when the token step refuses the request', async () => {
    passportOutcome = { isVerified: false };

    await expect(guard.canActivate(contextFor({}))).resolves.toBe(false);
    expect(findAccountStatus).not.toHaveBeenCalled();
  });
});
