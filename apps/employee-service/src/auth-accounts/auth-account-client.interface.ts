import type { AccountLookupItem, AccountReference } from '@dexa/contracts';

export const AUTH_ACCOUNT_CLIENT = Symbol('IAuthAccountClient');

/**
 * Reads the Auth-owned fields of accounts, such as the company email (DATABASE §4). Auth owns the accounts,
 * so this service never reads that table.
 */
export interface IAuthAccountClient {
  /** Resolves the account, or undefined when Auth has no such account (DATABASE §8). */
  findAccountById(accountId: string): Promise<AccountLookupItem | undefined>;
  /**
   * Resolves the accounts that Auth knows among `accountIds` in one call. Unknown and pending accounts are
   * absent from the answer. Callers pass at least one ID and at most ACCOUNT_LOOKUP_MAX_IDS.
   */
  lookupAccounts(accountIds: ReadonlyArray<string>): Promise<AccountLookupItem[]>;
  /** Resolves the account ID and role for a company email, or undefined when no active account uses it. */
  findAccountReferenceByEmail(email: string): Promise<AccountReference | undefined>;
  /**
   * Resolves the IDs of the accounts whose company email contains `term`, at most ACCOUNT_SEARCH_MAX_IDS of them
   * (D-15). Rejects when Auth is unavailable, because an empty answer would then read as "no match".
   */
  searchAccountIdsByEmail(term: string): Promise<string[]>;
}
