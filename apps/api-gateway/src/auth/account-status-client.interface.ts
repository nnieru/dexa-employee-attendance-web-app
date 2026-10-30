import type { AccountStatus } from '@dexa/contracts';

/**
 * The gateway's check on whether an account is still active. Only the guard depends on it, so it is
 * kept apart from the login and profile calls in IAuthServiceClient.
 */
export interface IAccountStatusClient {
  /** Throws NotFoundError when the account no longer exists. */
  getAccountStatus(accountId: string): Promise<AccountStatus>;
}

export const ACCOUNT_STATUS_CLIENT = Symbol('IAccountStatusClient');
