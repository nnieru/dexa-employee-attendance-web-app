// Mirrors the roles seeded into auth_db's master_roles. Add a role here only together with its seed
// migration, so that a token never carries a role that no account can hold.
export const Role = {
  EMPLOYEE: 'EMPLOYEE',
  HR: 'HR',
} as const;

export type Role = (typeof Role)[keyof typeof Role];
