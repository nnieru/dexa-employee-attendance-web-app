import {
  updateEmployeeRequestSchema,
  type MasterOption,
  type UpdateEmployeeRequest,
} from '@dexa/contracts';
import type { UpdateEmployeeFormValues } from '../types/update-employee-form.schema.js';

/** The changes HR made. A field is present only when it differs from the stored employee. */
export type UpdateEmployeeChanges = Partial<UpdateEmployeeRequest>;

type StoredEmployee = {
  name: string;
  phoneNumber: string | null;
  position: { id: string };
  employeeStatus: { id: string };
};

/**
 * Names only the fields that differ from the stored employee. An unchanged value would overwrite a self-service change
 * saved after the page loaded (DATABASE §4.3). The status is also named when a previous save reported a partial
 * failure: the server repeats the Auth call for it, which repairs the account (EmployeeUpdateService).
 * A value that is not present (a field not yet registered, or one that is disabled) counts as unchanged.
 */
export function toUpdateEmployeeChanges(
  values: Partial<UpdateEmployeeFormValues>,
  stored: StoredEmployee,
  shouldResendStatus: boolean,
): UpdateEmployeeChanges {
  const changes: UpdateEmployeeChanges = {};
  const name = (values.name ?? stored.name).trim();
  const phoneText = (values.phoneNumber ?? stored.phoneNumber ?? '').trim();
  const phoneNumber = phoneText.length > 0 ? phoneText : null;
  const positionId = values.positionId ?? stored.position.id;
  const employeeStatusId = values.employeeStatusId ?? stored.employeeStatus.id;
  const newPassword = values.newPassword ?? '';
  if (name !== stored.name) changes.name = name;
  if (positionId !== stored.position.id) changes.positionId = positionId;
  if (phoneNumber !== stored.phoneNumber) changes.phoneNumber = phoneNumber;
  if (shouldResendStatus || employeeStatusId !== stored.employeeStatus.id) {
    changes.employeeStatusId = employeeStatusId;
  }
  if (newPassword.length > 0) changes.newPassword = newPassword;
  return changes;
}

export function hasUpdateEmployeeChanges(changes: UpdateEmployeeChanges): boolean {
  return Object.keys(changes).length > 0;
}

/** Parses the changes with the contract before they are sent. A request with no changes is refused by the contract. */
export function toUpdateEmployeeRequest(changes: UpdateEmployeeChanges): UpdateEmployeeRequest {
  return updateEmployeeRequestSchema.parse(changes);
}

// The master code that deactivates an account (D-13). Every other status keeps the account active.
const INACTIVE_EMPLOYEE_STATUS_CODE = 'INACTIVE';

/** True when the changes name a status that deactivates the account. Such a save asks for confirmation first. */
export function isDeactivatingChange(
  changes: UpdateEmployeeChanges,
  statusOptions: ReadonlyArray<MasterOption>,
): boolean {
  if (changes.employeeStatusId === undefined) return false;
  const status = statusOptions.find((option) => option.id === changes.employeeStatusId);
  return status?.code === INACTIVE_EMPLOYEE_STATUS_CODE;
}
