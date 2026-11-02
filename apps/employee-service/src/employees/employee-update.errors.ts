import { ConflictError, DependencyUnavailableError } from '@dexa/common';
import { ErrorCode, type EmployeeUpdateIncompleteDetails } from '@dexa/contracts';

const INCOMPLETE_MESSAGE =
  'The employee update did not finish. Check the employee before saving the update again.';
const SELF_DEACTIVATION_MESSAGE = 'An HR account cannot deactivate its own account.';

/** The steps of an update that have saved so far, and the outcome of the step that stopped it (see the details schema). */
export type EmployeeUpdateProgress = Omit<EmployeeUpdateIncompleteDetails, 'accountId'>;

/** Before the first step, nothing has saved and no step has been attempted. */
export const NOTHING_SAVED: EmployeeUpdateProgress = {
  profileSaved: false,
  accountStatusSaved: null,
  passwordReset: null,
};

/** A step after the first save failed, so the answer names which steps saved. */
export function employeeUpdateIncompleteError(
  accountId: string,
  progress: EmployeeUpdateProgress,
): DependencyUnavailableError {
  const details: EmployeeUpdateIncompleteDetails = { accountId, ...progress };
  return new DependencyUnavailableError(ErrorCode.EMPLOYEE_UPDATE_INCOMPLETE, INCOMPLETE_MESSAGE, {
    details,
  });
}

export function selfDeactivationError(): ConflictError {
  return new ConflictError(ErrorCode.CONFLICT, SELF_DEACTIVATION_MESSAGE);
}
