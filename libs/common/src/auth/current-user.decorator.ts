import { createParamDecorator, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { authenticatedUserSchema, type AuthenticatedUser } from './authenticated-principal.js';

/**
 * Reads the user that the route's guard attached to the request (JwtAuthGuard or GatewayUserAuthGuard). A route without that guard has no user,
 * and it is refused rather than served without an identity.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<{ user?: unknown }>();
    const user = authenticatedUserSchema.safeParse(request.user);
    if (!user.success) throw new UnauthorizedException();
    return user.data;
  },
);
