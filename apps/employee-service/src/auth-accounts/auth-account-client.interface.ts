import type { AccountLookupItem } from '@dexa/contracts';

export const AUTH_ACCOUNT_CLIENT = Symbol('IAuthAccountClient');

/**
 * Reads the Auth-owned fields of one account, such as the company email (DATABASE §4). Auth owns the
 * accounts, so this service never reads that table. Resolves undefined when Auth has no such account.
 */
export interface IAuthAccountClient {
  findAccountById(accountId: string): Promise<AccountLookupItem | undefined>;
}
