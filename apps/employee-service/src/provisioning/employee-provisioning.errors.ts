import { ConflictError, DependencyUnavailableError, ValidationError } from '@dexa/common';
import { ErrorCode, type EmployeeProvisioningIncompleteDetails } from '@dexa/contracts';
import type { MasterAssignmentField } from './employee-provisioning.repository.interface.js';

const OPERATION_REUSED_MESSAGE = 'This operation ID was already used for a different request.';
const PROFILE_EXISTS_MESSAGE = 'An employee profile already exists for this account.';
const INCOMPLETE_MESSAGE =
  'Employee creation did not finish. Retry with the same operation ID to finish it.';
const DEPENDENCY_UNAVAILABLE_MESSAGE = 'A dependent service is unavailable. Try again shortly.';

// Messages name the field only, in the same form as the request validation errors.
const MASTER_NOT_ASSIGNABLE_MESSAGES: Readonly<Record<MasterAssignmentField, string>> = {
  positionId: 'positionId: must reference an existing active position.',
  employeeStatusId: 'employeeStatusId: must reference an existing active employee status.',
};

export function operationReusedError(): ConflictError {
  return new ConflictError(ErrorCode.CONFLICT, OPERATION_REUSED_MESSAGE);
}

export function profileExistsError(): ConflictError {
  return new ConflictError(ErrorCode.CONFLICT, PROFILE_EXISTS_MESSAGE);
}

export function masterNotAssignableError(field: MasterAssignmentField): ValidationError {
  return new ValidationError(ErrorCode.VALIDATION_FAILED, MASTER_NOT_ASSIGNABLE_MESSAGES[field]);
}

/** A stopped operation answers 503 with its ID and the phase that was saved, so HR can resume it (DATABASE §4.3). */
export function provisioningIncompleteError(
  details: EmployeeProvisioningIncompleteDetails,
): DependencyUnavailableError {
  return new DependencyUnavailableError(
    ErrorCode.EMPLOYEE_PROVISIONING_INCOMPLETE,
    INCOMPLETE_MESSAGE,
    { details },
  );
}

export function dependencyUnavailableError(): DependencyUnavailableError {
  return new DependencyUnavailableError(
    ErrorCode.DEPENDENCY_UNAVAILABLE,
    DEPENDENCY_UNAVAILABLE_MESSAGE,
  );
}
