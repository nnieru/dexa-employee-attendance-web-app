import type { AccountStatus } from '@dexa/contracts';

/**
 * Reads whether an account may still use its token. Only api-gateway binds it (D-51): JwtAuthGuard calls it on
 * every user request, and the gateway's stream monitor calls it while a stream is open. It reads auth-service
 * over the internal API, so no other service needs the reader.
 */
export interface IAccountStatusReader {
  /** Resolves undefined when no account has the ID. Errors other than "not found" propagate to the caller. */
  findAccountStatus(accountId: string): Promise<AccountStatus | undefined>;
}

export const ACCOUNT_STATUS_READER = Symbol('IAccountStatusReader');
