import type {
  AccountStatus,
  ResetAccountPasswordRequest,
  SetAccountActiveStatusRequest,
} from '@dexa/contracts';

/** HR actions on another account, invoked by employee-service after it has checked the HR role (T-EMP-08). */
export interface IAccountAdministrationService {
  /**
   * Resolves once the new hash and its account.password.changed outbox row have committed together.
   * Rejects with a domain error when the actor is not an eligible HR account or the target is not found.
   */
  resetPassword(accountId: string, request: ResetAccountPasswordRequest): Promise<void>;
  /** Resolves the stored active flag after the change. Restating the current value succeeds. */
  setActiveStatus(
    accountId: string,
    request: SetAccountActiveStatusRequest,
  ): Promise<AccountStatus>;
}

export const ACCOUNT_ADMINISTRATION_SERVICE = Symbol('IAccountAdministrationService');
