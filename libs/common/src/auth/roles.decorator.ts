import { SetMetadata } from '@nestjs/common';
import type { Role } from '@dexa/contracts';

export const ROLES_KEY = 'roles';

/**
 * Names the roles that may call a route. A protected route without @Roles is refused by RolesGuard, so a
 * new route is closed until it names its roles.
 */
export const Roles = (...roles: [Role, ...Role[]]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
