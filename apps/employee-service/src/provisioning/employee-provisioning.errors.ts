import { ConflictError, DependencyUnavailableError } from '@dexa/common';
import { ErrorCode, type EmployeeProvisioningIncompleteDetails } from '@dexa/contracts';

const OPERATION_REUSED_MESSAGE = 'This operation ID was already used for a different request.';
const PROFILE_EXISTS_MESSAGE = 'An employee profile already exists for this account.';
const INCOMPLETE_MESSAGE =
  'Employee creation did not finish. Retry with the same operation ID to finish it.';
const DEPENDENCY_UNAVAILABLE_MESSAGE = 'A dependent service is unavailable. Try again shortly.';

export function operationReusedError(): ConflictError {
  return new ConflictError(ErrorCode.CONFLICT, OPERATION_REUSED_MESSAGE);
}

export function profileExistsError(): ConflictError {
  return new ConflictError(ErrorCode.CONFLICT, PROFILE_EXISTS_MESSAGE);
}

/** A stopped operation answers 503 with its ID and the phase that was saved, so HR can resume it. */
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
