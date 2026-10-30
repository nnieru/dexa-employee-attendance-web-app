import { Portal, Role } from '@dexa/contracts';

// PRD AUTH-3 and D-14: the employee portal also accepts HR accounts, because HR staff clock in and manage
// their own profile. The HR portal accepts HR accounts only.
const ROLES_ACCEPTED_BY_PORTAL: Readonly<Record<Portal, ReadonlyArray<Role>>> = {
  [Portal.EMPLOYEE]: [Role.EMPLOYEE, Role.HR],
  [Portal.HR]: [Role.HR],
};

export type SignInCandidate = {
  readonly isActive: boolean;
  readonly isProvisioningPending: boolean;
  readonly roleCode: string;
};

/**
 * The role that the account signs in with on this portal, or undefined when it may not sign in there.
 * The caller checks the password first, so every refusal reaches the client the same way.
 */
export function resolveSignInRole(candidate: SignInCandidate, portal: Portal): Role | undefined {
  if (!candidate.isActive || candidate.isProvisioningPending) return undefined;
  const role = findKnownRole(candidate.roleCode);
  if (role === undefined || !ROLES_ACCEPTED_BY_PORTAL[portal].includes(role)) return undefined;
  return role;
}

/** Stored role codes are plain strings, so a code that this service does not know resolves to undefined. */
export function findKnownRole(roleCode: string): Role | undefined {
  return Object.values(Role).find((role) => role === roleCode);
}
