import { z } from 'zod';
import { Role } from './role.js';

// Returned by GET /auth/me and embedded in the login response, so both describe an account the same way.
export const currentAccountSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  role: z.enum(Role),
});

export type CurrentAccount = z.infer<typeof currentAccountSchema>;
