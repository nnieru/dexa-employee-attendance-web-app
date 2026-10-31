import type { CurrentAccount } from '@dexa/contracts';

/** Looks up the account that a forwarded call names, and refuses the call when that account is not usable. */
export interface ICurrentAccountService {
  getCurrentAccount(accountId: string): Promise<CurrentAccount>;
}

export const CURRENT_ACCOUNT_SERVICE = Symbol('ICurrentAccountService');
