import type { Role } from '@dexa/contracts';
import type { IAccountTransaction } from './account-transaction.interface.js';

/** An account as sign-in and identity lookups see it. The password hash is not part of this shape. */
export type AccountRecord = {
  readonly id: string;
  readonly companyEmail: string;
  readonly roleCode: string;
  readonly isActive: boolean;
  // A provisioning operation that is still PENDING keeps the account out of sign-in.
  readonly isProvisioningPending: boolean;
};

export type SignInAccountRecord = AccountRecord & {
  readonly passwordHash: string;
};

export interface IAccountRepository {
  hasAccountWithRole(roleCode: Role): Promise<boolean>;
  /** Matches the company email without regard to letter case. Resolves undefined when none matches. */
  findSignInAccountByEmail(companyEmail: string): Promise<SignInAccountRecord | undefined>;
  findAccountById(accountId: string): Promise<AccountRecord | undefined>;
  /**
   * Runs `work` in one transaction that first takes the advisory lock `lockKey`. Runs that name the
   * same key execute one at a time, including runs in other replicas, so a check made inside `work`
   * sees whatever the earlier run committed.
   */
  runExclusiveTransaction<TResult>(
    lockKey: number,
    work: (transaction: IAccountTransaction) => Promise<TResult>,
  ): Promise<TResult>;
}

export const ACCOUNT_REPOSITORY = Symbol('IAccountRepository');
