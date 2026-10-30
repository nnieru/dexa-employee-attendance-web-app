import type { ProfileStatus } from '@dexa/contracts';
import type { MasterAssignmentField } from '../masters/master-assignment.reader.interface.js';
import type { EmployeeProvisioningState } from './employee-provisioning-state.js';

export const EMPLOYEE_PROVISIONING_REPOSITORY = Symbol('IEmployeeProvisioningRepository');

/** One stored operation. accountId is undefined until Auth has answered for the operation. */
export type EmployeeProvisioningOperation = {
  readonly operationId: string;
  readonly actorAccountId: string;
  readonly requestFingerprintSha256: string;
  readonly accountId: string | undefined;
  readonly state: EmployeeProvisioningState;
};

export type NewEmployeeProvisioningOperation = {
  readonly operationId: string;
  readonly actorAccountId: string;
  readonly requestFingerprintSha256: string;
};

/** The profile that a RESERVED operation saves. The caller derives profileStatus (DATABASE §4.1). */
export type NewEmployeeProfile = {
  readonly accountId: string;
  readonly name: string;
  readonly positionId: string;
  readonly employeeStatusId: string;
  readonly phoneNumber: string | null;
  readonly profileStatus: ProfileStatus;
};

export type ProfileSaveOutcome =
  | { readonly kind: 'SAVED' }
  | { readonly kind: 'ALREADY_SAVED'; readonly state: EmployeeProvisioningState }
  | { readonly kind: 'PROFILE_EXISTS' }
  | { readonly kind: 'MASTER_NOT_ASSIGNABLE'; readonly field: MasterAssignmentField };

/**
 * Reads and writes the provisioning operations and the employee profiles they create. Every write that spans
 * the operation and the profile runs in one transaction. Driver errors are sanitized before they leave this port.
 */
export interface IEmployeeProvisioningRepository {
  findOperation(operationId: string): Promise<EmployeeProvisioningOperation | undefined>;
  /** Stores a RESERVED operation unless the operation ID is taken, then returns the stored row, whoever stored it. */
  reserveOperation(
    operation: NewEmployeeProvisioningOperation,
  ): Promise<EmployeeProvisioningOperation>;
  /** Saves the profile and binds the account in one transaction, only while the operation is still RESERVED. */
  saveProfileForReservedOperation(
    operationId: string,
    profile: NewEmployeeProfile,
  ): Promise<ProfileSaveOutcome>;
  /** Moves a PROFILE_SAVED operation to ACTIVE. Any other stored phase is left unchanged. */
  markOperationActive(operationId: string): Promise<void>;
}
