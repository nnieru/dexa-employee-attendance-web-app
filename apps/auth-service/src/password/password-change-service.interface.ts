import type { ChangePasswordRequest } from '@dexa/contracts';

/** Lets an authenticated account replace its own password (DATABASE §3.2). */
export interface IPasswordChangeService {
  /**
   * Resolves once the new hash and its account.password.changed outbox row have committed together.
   * Rejects with a domain error when the current password is wrong or the account cannot change it.
   */
  changePassword(accountId: string, request: ChangePasswordRequest): Promise<void>;
}

export const PASSWORD_CHANGE_SERVICE = Symbol('IPasswordChangeService');
