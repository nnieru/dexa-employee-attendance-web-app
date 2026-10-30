/** The fields an identity lookup reads. The password hash is deliberately absent. */
export type AccountIdentityRecord = {
  readonly id: string;
  readonly companyEmail: string;
  readonly roleCode: string;
};

export type AccountIdentityByEmailRecord = Pick<AccountIdentityRecord, 'id' | 'roleCode'>;

/** A window of rows: `limit` rows after the first `offset` rows in account ID order. */
export type AccountIdWindow = {
  readonly limit: number;
  readonly offset: number;
};

/**
 * Reads for the internal lookup routes. Kept apart from IAccountRepository so that sign-in and provisioning
 * code does not depend on lookup queries, and lookup code does not depend on writes.
 */
export interface IAccountLookupReader {
  /** Resolves the accounts among `accountIds` that are not provisioning-PENDING. Unknown IDs are absent. */
  findIdentitiesByIds(accountIds: ReadonlyArray<string>): Promise<AccountIdentityRecord[]>;
  /** Matches the company email without regard to letter case, skipping PENDING accounts. */
  findIdentityByEmail(companyEmail: string): Promise<AccountIdentityByEmailRecord | undefined>;
  /** Account IDs whose company email contains `emailTerm` without regard to letter case. `%`, `_`, and `\` match literally. */
  searchAccountIdsByEmail(emailTerm: string, maxIds: number): Promise<string[]>;
  /** The IDs of active HR accounts that are not PENDING, in ascending order. */
  listHrRecipientIds(window: AccountIdWindow): Promise<string[]>;
  countHrRecipients(): Promise<number>;
  /** Reads `is_active` by primary key. Resolves undefined when no account has the ID. */
  findIsActiveByAccountId(accountId: string): Promise<boolean | undefined>;
}

export const ACCOUNT_LOOKUP_READER = Symbol('IAccountLookupReader');
