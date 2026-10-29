import { Role } from '@dexa/contracts';
import { z } from 'zod';
import type { ServiceName } from './service-name.js';

export const roleSchema = z.enum(Role);

// Also used to narrow request.user in CurrentUser, because the request value is typed unknown.
export const authenticatedUserSchema = z.object({
  accountId: z.uuid(),
  role: roleSchema,
});

export type AuthenticatedUser = Readonly<z.infer<typeof authenticatedUserSchema>>;

export type AuthenticatedService = {
  readonly serviceName: ServiceName;
};
