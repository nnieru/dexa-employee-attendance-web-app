import type { OutboxTransaction } from '@dexa/messaging';

/** The account state that decides whether a password change may proceed, plus the stored hash to verify. */
export type PasswordCredentialRecord = {
  readonly accountId: string;
  readonly passwordHash: string;
  readonly isActive: boolean;
  // A PENDING provisioning operation keeps the account out of use until HR activates it (DATABASE
  // §3.1).
  readonly isProvisioningPending: boolean;
};

export type PasswordHashReplacement = {
  readonly accountId: string;
  // The hash that the current password was verified against. The update applies only while it is
  // still stored.
  readonly previousPasswordHash: string;
  readonly newPasswordHash: string;
};

/**
 * Writes that share one transaction with the outbox row, so the password and its event commit
 * together.
 */
export type IPasswordChangeTransaction = OutboxTransaction & {
  /** Resolves false when the stored hash is no longer the previous one, so another change won the race. */
  replacePasswordHash(replacement: PasswordHashReplacement): Promise<boolean>;
};

export interface IPasswordChangeRepository {
  findCredentialByAccountId(accountId: string): Promise<PasswordCredentialRecord | undefined>;
  runInTransaction<TResult>(
    work: (transaction: IPasswordChangeTransaction) => Promise<TResult>,
  ): Promise<TResult>;
}

export const PASSWORD_CHANGE_REPOSITORY = Symbol('IPasswordChangeRepository');
