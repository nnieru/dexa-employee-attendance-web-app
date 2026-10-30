import type { Role } from '@dexa/contracts';

export type NewAccount = {
  readonly companyEmail: string;
  readonly passwordHash: string;
  readonly roleCode: Role;
};

/** Reads and writes that share one transaction, so they commit or roll back together. */
export interface IAccountTransaction {
  hasAccountWithRole(roleCode: Role): Promise<boolean>;
  createAccount(account: NewAccount): Promise<void>;
}
