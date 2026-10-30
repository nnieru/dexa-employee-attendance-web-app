import type { OutboxTransaction } from '@dexa/messaging';

/**
 * Writes that share one transaction with the outbox row, so the password and its event commit together.
 */
export type IAccountAdministrationTransaction = OutboxTransaction & {
  /** Resolves false when no account matches the ID, so the caller can report it as not found. */
  replacePasswordHash(accountId: string, passwordHash: string): Promise<boolean>;
};

export interface IAccountAdministrationRepository {
  runInTransaction<TResult>(
    work: (transaction: IAccountAdministrationTransaction) => Promise<TResult>,
  ): Promise<TResult>;
  /** Stores the flag in one statement and resolves the stored value, or undefined when no account matches. */
  updateIsActive(accountId: string, isActive: boolean): Promise<boolean | undefined>;
}

export const ACCOUNT_ADMINISTRATION_REPOSITORY = Symbol('IAccountAdministrationRepository');
