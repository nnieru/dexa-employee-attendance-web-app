import type { AccountStatus } from '@dexa/contracts';

/**
 * Reads whether an account may still use its token. JwtAuthGuard calls it on every user-token request, so
 * a deactivated account loses access on its next call. Each service binds it: auth-service reads its own
 * table, and every other service calls auth-service over the internal API.
 */
export interface IAccountStatusReader {
  /** Resolves undefined when no account has the ID. Errors other than "not found" propagate to the caller. */
  findAccountStatus(accountId: string): Promise<AccountStatus | undefined>;
}

export const ACCOUNT_STATUS_READER = Symbol('IAccountStatusReader');
