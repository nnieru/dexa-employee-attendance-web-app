import { Role } from '@dexa/contracts';

/** The operation fields that a retry under the same operation ID must repeat. */
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
