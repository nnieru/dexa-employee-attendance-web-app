import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host.js';
import { ErrorCode, Role } from '@dexa/contracts';
import { ForbiddenError, UnauthorizedError } from '../errors/domain.errors.js';
import { Public } from './public.decorator.js';
import { Roles } from './roles.decorator.js';
import { RolesGuard } from './roles.guard.js';

const ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';

class FixtureController {
  @Public()
  publicRoute(): void {}

  @Roles(Role.HR)
  hrRoute(): void {}

  @Roles(Role.EMPLOYEE, Role.HR)
  selfServiceRoute(): void {}

  unannotatedRoute(): void {}
}

type FixtureRoute = keyof FixtureController;

function contextFor(route: FixtureRoute, user: unknown): ExecutionContext {
  const request = { user };
  return new ExecutionContextHost([request], FixtureController, FixtureController.prototype[route]);
}

function captureError(action: () => unknown): unknown {
  try {
    action();
  } catch (error: unknown) {
    return error;
  }
  throw new Error('Expected the call to throw.');
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());
  const hrUser = { accountId: ACCOUNT_ID, role: Role.HR };
  const employeeUser = { accountId: ACCOUNT_ID, role: Role.EMPLOYEE };

  it.each([
    {
      condition: 'the route is public and no user is present',
      route: 'publicRoute',
      user: undefined,
    },
    { condition: 'the user holds the only role the route allows', route: 'hrRoute', user: hrUser },
    {
      condition: 'the user holds one of several roles the route allows',
      route: 'selfServiceRoute',
      user: employeeUser,
    },
  ] satisfies ReadonlyArray<{ condition: string; route: FixtureRoute; user: unknown }>)(
    'should allow the request when $condition',
    ({ route, user }) => {
      expect(guard.canActivate(contextFor(route, user))).toBe(true);
    },
  );

  it.each([
    {
      condition: 'the user role is not allowed by the route',
      route: 'hrRoute',
      user: employeeUser,
      error: ForbiddenError,
      code: ErrorCode.FORBIDDEN,
    },
    {
      condition: 'the protected route has no @Roles() metadata',
      route: 'unannotatedRoute',
      user: hrUser,
      error: ForbiddenError,
      code: ErrorCode.FORBIDDEN,
    },
    {
      condition: 'the request has no verified user',
      route: 'hrRoute',
      user: undefined,
      error: UnauthorizedError,
      code: ErrorCode.UNAUTHORIZED,
    },
  ] satisfies ReadonlyArray<{
    condition: string;
    route: FixtureRoute;
    user: unknown;
    error: new (...args: never[]) => Error;
    code: string;
  }>)('should refuse the request with $code when $condition', ({ route, user, error, code }) => {
    const refusal = captureError(() => guard.canActivate(contextFor(route, user)));

    expect(refusal).toBeInstanceOf(error);
    expect(refusal).toMatchObject({ code });
  });
});
