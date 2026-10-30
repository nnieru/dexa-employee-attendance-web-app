import type { AccountProvisioningStatus, Role } from '@dexa/contracts';
import type { ProvisioningActor } from './account-provisioning.rules.js';

/** One operation as stored. It includes the initial password verifier, so it never leaves the service. */
export type ProvisioningOperationRecord = {
  readonly operationId: string;
  readonly accountId: string;
  readonly actorAccountId: string;
  readonly requestedEmail: string;
  readonly requestedRole: string;
  readonly initialPasswordHash: string;
  readonly status: AccountProvisioningStatus;
};

export type NewProvisioningOperation = {
  readonly operationId: string;
  readonly actorAccountId: string;
  readonly companyEmail: string;
  readonly roleCode: Role;
  readonly initialPasswordHash: string;
};

/** The unique index that rejected the insert. The service re-reads the stored operation for either one. */
export type InsertRejection = 'EMAIL_TAKEN' | 'OPERATION_ID_TAKEN';

export type InsertProvisioningOperationResult =
  | { readonly kind: 'INSERTED'; readonly operation: ProvisioningOperationRecord }
  | { readonly kind: InsertRejection };

export interface IAccountProvisioningRepository {
  findActorAccount(accountId: string): Promise<ProvisioningActor | undefined>;
  findOperation(operationId: string): Promise<ProvisioningOperationRecord | undefined>;
  /** Inserts the account and its PENDING operation in one transaction, or reports the unique index that refused them. */
  createAccountWithOperation(
    newOperation: NewProvisioningOperation,
  ): Promise<InsertProvisioningOperationResult>;
  /** Moves a PENDING operation to ACTIVE. An operation that is not PENDING, or does not exist, is left unchanged. */
  activatePendingOperation(operationId: string): Promise<void>;
}

export const ACCOUNT_PROVISIONING_REPOSITORY = Symbol('IAccountProvisioningRepository');
