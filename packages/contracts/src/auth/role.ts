import { z } from 'zod';

// Mirrors the roles seeded into auth_db's master_roles. Add a role here only together with its seed
// migration, so that a token never carries a role that no account can hold.
export const Role = {
  EMPLOYEE: 'EMPLOYEE',
  HR: 'HR',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

// Parses a stored or received role code. A code that is not listed above fails here instead of passing through.
export const roleSchema = z.enum(Role);
