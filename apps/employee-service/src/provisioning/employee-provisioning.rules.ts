import { AccountProvisioningStatus, type AccountProvisioningOperation } from '@dexa/contracts';
import { EmployeeProvisioningState } from './employee-provisioning-state.js';
import type {
  MasterAssignmentField,
  MasterOptionStatus,
} from './employee-provisioning.repository.interface.js';

/** The fields of a stored operation that decide whether a request repeats it. */
export type StoredProvisioningRequest = {
  readonly actorAccountId: string;
  readonly requestFingerprintSha256: string;
};

/** A request matches only when the same HR actor sent the same non-secret fields (DATABASE §4.3). */
export function isSameProvisioningRequest(
  stored: StoredProvisioningRequest,
  actorAccountId: string,
  fingerprint: string,
): boolean {
  return (
    stored.actorAccountId === actorAccountId && stored.requestFingerprintSha256 === fingerprint
  );
}

/** Only a RESERVED operation still needs its profile saved. A later retry never overwrites a saved profile. */
export function needsProfileSave(state: EmployeeProvisioningState): boolean {
  return state === EmployeeProvisioningState.RESERVED;
}

/** Activation is the last step, so every operation short of ACTIVE still needs it. */
export function needsActivation(state: EmployeeProvisioningState): boolean {
  return state !== EmployeeProvisioningState.ACTIVE;
}

/**
 * Names the first master option that cannot be newly assigned: one that does not exist or is inactive. The
 * position is checked first, so the response names a single field.
 */
export function findUnassignableMasterField(
  position: MasterOptionStatus,
  employeeStatus: MasterOptionStatus,
): MasterAssignmentField | undefined {
  if (!isAssignable(position)) return 'positionId';
  if (!isAssignable(employeeStatus)) return 'employeeStatusId';
  return undefined;
}

/** An activation answer confirms the account only when Auth reports this account as ACTIVE. */
export function isActivationConfirmed(
  answer: AccountProvisioningOperation,
  accountId: string,
): boolean {
  return answer.status === AccountProvisioningStatus.ACTIVE && answer.accountId === accountId;
}

function isAssignable(option: MasterOptionStatus): boolean {
  return option?.isActive === true;
}
