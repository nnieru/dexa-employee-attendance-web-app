import type {
  AccountIdPage,
  AccountLookupItem,
  AccountReference,
  AccountSearchResponse,
  AccountStatus,
  PaginationQuery,
} from '@dexa/contracts';

/** Identity lookups that other services call. Each method answers one route. */
export interface IAccountLookupService {
  lookupAccounts(accountIds: ReadonlyArray<string>): Promise<AccountLookupItem[]>;
  listHrRecipientIds(query: PaginationQuery): Promise<AccountIdPage>;
  getAccountStatus(accountId: string): Promise<AccountStatus>;
  searchAccounts(emailTerm: string): Promise<AccountSearchResponse>;
  findAccountByEmail(companyEmail: string): Promise<AccountReference>;
}

export const ACCOUNT_LOOKUP_SERVICE = Symbol('IAccountLookupService');
