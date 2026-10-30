import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode, type Role } from '@dexa/contracts';
import { ForbiddenError, UnauthorizedError } from '../errors/domain.errors.js';
import { authenticatedUserSchema } from './authenticated-principal.js';
import { isPublicRoute } from './public.decorator.js';
import { ROLES_KEY } from './roles.decorator.js';

const SIGN_IN_MESSAGE = 'Sign in to continue.';
const ROLE_NOT_PERMITTED_MESSAGE = 'Your role cannot use this action.';
const ROUTE_ROLES_MISSING_MESSAGE = 'This action is not permitted.';

/**
 * Checks the signed-in user's role against @Roles(). It runs after the user token guard, so the user is
 * already verified. A protected route without @Roles() is refused, so forgetting the decorator fails closed.
 * Every service that serves HR routes registers it, so each one enforces the role itself.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (isPublicRoute(this.reflector, context)) return true;

    const allowedRoles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowedRoles === undefined) {
      throw new ForbiddenError(ErrorCode.FORBIDDEN, ROUTE_ROLES_MISSING_MESSAGE);
    }

    const user = authenticatedUserSchema.safeParse(
      context.switchToHttp().getRequest<{ user?: unknown }>().user,
    );
    if (!user.success) throw new UnauthorizedError(ErrorCode.UNAUTHORIZED, SIGN_IN_MESSAGE);

    if (!allowedRoles.includes(user.data.role)) {
      throw new ForbiddenError(ErrorCode.FORBIDDEN, ROLE_NOT_PERMITTED_MESSAGE);
    }
    return true;
  }
}
