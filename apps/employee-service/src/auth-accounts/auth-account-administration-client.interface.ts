import type {
  AccountStatus,
  ResetAccountPasswordRequest,
  SetAccountActiveStatusRequest,
} from '@dexa/contracts';

export const AUTH_ACCOUNT_ADMINISTRATION_CLIENT = Symbol('IAuthAccountAdministrationClient');

/**
 * Calls auth-service's HR administration routes with this service's own token. The HR actor travels in the
 * body, and Auth checks that it is an active HR account. No call is retried: the change may already have applied when
 * its answer was lost, so the caller reports the step as unconfirmed.
 */
export interface IAuthAccountAdministrationClient {
  /** Auth saves the new hash and writes account.password.changed in the same transaction. */
  resetPassword(accountId: string, request: ResetAccountPasswordRequest): Promise<void>;
  /** Idempotent: restating the stored flag succeeds. Auth refuses an HR account that deactivates itself with 409. */
  setActiveStatus(
    accountId: string,
    request: SetAccountActiveStatusRequest,
  ): Promise<AccountStatus>;
}
