import { Role } from '@dexa/contracts';

/** The operation fields that a retry under the same operation ID must repeat (DATABASE §3.1). */
export type StoredProvisioningRequest = {
  readonly actorAccountId: string;
  readonly requestedEmail: string;
  readonly requestedRole: string;
};

/** The normalized fields of a create request, after validation. */
export type ProvisioningRequestFields = {
  readonly actorAccountId: string;
  readonly email: string;
  readonly role: Role;
};

/** The account state that decides whether an actor may create accounts. */
export type ProvisioningActor = {
  readonly roleCode: string;
  readonly isActive: boolean;
  readonly isProvisioningPending: boolean;
};

/**
 * Decides whether a create request repeats the request that its operation ID already stored. The
 * password is judged by the caller, because only the caller holds the argon2 verifier. A retry
 * matches only when every field matches, so any difference is a conflict under that ID.
 */
export function isRetryOfStoredRequest(
  stored: StoredProvisioningRequest,
  request: ProvisioningRequestFields,
  isPasswordMatching: boolean,
): boolean {
  return (
    isPasswordMatching &&
    stored.actorAccountId === request.actorAccountId &&
    stored.requestedEmail === request.email &&
    stored.requestedRole === request.role
  );
}

/** Only an active HR account that is past its own provisioning may create accounts (D-16, DATABASE §3.1). */
export function isEligibleProvisioningActor(actor: ProvisioningActor | undefined): boolean {
  return (
    actor !== undefined &&
    actor.roleCode === Role.HR &&
    actor.isActive &&
    !actor.isProvisioningPending
  );
}
