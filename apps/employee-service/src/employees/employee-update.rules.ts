import type { ProfileField, ProfileStatus, UpdateEmployeeRequest } from '@dexa/contracts';
import type { MasterReferenceToAssign } from '../masters/assert-masters-assignable.js';
import type {
  EmployeeFieldsChanges,
  LockedEmployeeProfile,
} from '../profile/employee-profile.writer.interface.js';
import { calculateProfileStatus } from '../profile/profile-completion.rules.js';
import type { EmployeeDetailRecord } from './employee-detail.reader.interface.js';

/** The profile fields of an HR update. The password is not one of them: it goes to Auth only. */
export type EmployeeProfileRequest = Pick<
  UpdateEmployeeRequest,
  'name' | 'positionId' | 'phoneNumber' | 'employeeStatusId'
>;

/** The columns that a committed update writes, and the field names that its change event reports. */
export type EmployeeProfilePlan = {
  readonly changes: EmployeeFieldsChanges;
  readonly changedFields: ReadonlyArray<ProfileField>;
};

/** True when the request names a profile field. A password-only request writes no profile row. */
export function requestsProfileChange(request: EmployeeProfileRequest): boolean {
  return [request.name, request.positionId, request.phoneNumber, request.employeeStatusId].some(
    (value) => value !== undefined,
  );
}

/**
 * Returns undefined when every named field already holds the requested value, so nothing is written and nothing is
 * reported. Otherwise only the changed columns are planned. The locked row is the base, so a column that the request
 * does not name keeps its stored value, including one that a self-service edit changed meanwhile.
 * The status is recomputed from the merged row, and profileStatus is written only when it moves.
 */
export function planEmployeeUpdate(
  stored: LockedEmployeeProfile,
  request: EmployeeProfileRequest,
): EmployeeProfilePlan | undefined {
  const changes: MutableChanges = {};
  const changedFields: ProfileField[] = [];
  if (isRequestedChange(request.name, stored.name)) {
    changes.name = request.name;
    changedFields.push('name');
  }
  if (isRequestedChange(request.positionId, stored.positionId)) {
    changes.positionId = request.positionId;
    changedFields.push('position');
  }
  if (isRequestedChange(request.phoneNumber, stored.phoneNumber)) {
    changes.phoneNumber = request.phoneNumber;
    changedFields.push('phoneNumber');
  }
  if (isRequestedChange(request.employeeStatusId, stored.employeeStatusId)) {
    changes.employeeStatusId = request.employeeStatusId;
    changedFields.push('employeeStatus');
  }
  if (changedFields.length === 0) return undefined;

  const profileStatus = calculateProfileStatus({
    name: changes.name ?? stored.name,
    positionId: changes.positionId ?? stored.positionId,
    phoneNumber: changes.phoneNumber === undefined ? stored.phoneNumber : changes.phoneNumber,
    photoKey: stored.photoKey,
  });
  if (profileStatus !== stored.profileStatus) {
    changes.profileStatus = profileStatus;
    changedFields.push('profileStatus');
  }
  return { changes, changedFields };
}

/**
 * The references that the request assigns anew. A reference that keeps its stored option stays valid even when that
 * option is inactive, as the database rule also allows.
 */
export function toChangedMasterReferences(
  stored: EmployeeDetailRecord,
  request: EmployeeProfileRequest,
): MasterReferenceToAssign[] {
  const references: MasterReferenceToAssign[] = [];
  if (isRequestedChange(request.positionId, stored.position.id)) {
    references.push({ field: 'positionId', optionId: request.positionId });
  }
  if (isRequestedChange(request.employeeStatusId, stored.employeeStatus.id)) {
    references.push({ field: 'employeeStatusId', optionId: request.employeeStatusId });
  }
  return references;
}

/** A field is changed only when the request names it and the stored value differs. */
export function isRequestedChange<TValue>(
  requested: TValue | undefined,
  stored: TValue,
): requested is TValue {
  return requested !== undefined && requested !== stored;
}

// EmployeeFieldsChanges is read-only; the plan is built in this mutable shape and then returned as read-only.
type MutableChanges = {
  name?: string;
  positionId?: string;
  phoneNumber?: string | null;
  employeeStatusId?: string;
  profileStatus?: ProfileStatus;
};
