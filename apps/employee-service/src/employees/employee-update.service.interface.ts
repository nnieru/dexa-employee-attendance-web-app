import type { EmployeeDetail, ProfileField, UpdateEmployeeRequest } from '@dexa/contracts';

export const EMPLOYEE_UPDATE_SERVICE = Symbol('IEmployeeUpdateService');

/** An HR update of one employee. The actor comes from the verified token; the target is the path parameter. */
export type EmployeeUpdateCommand = {
  readonly actorAccountId: string;
  readonly accountId: string;
  readonly request: UpdateEmployeeRequest;
};

/**
 * The employee as stored after the update, and the profile fields whose change was committed. The change set is empty
 * when the request changed no stored column. The change event reads changedFields.
 */
export type EmployeeUpdateResult = {
  readonly employee: EmployeeDetail;
  readonly changedFields: ReadonlyArray<ProfileField>;
};

/** HR's update of an employee. */
export interface IEmployeeUpdateService {
  /**
   * Resolves once every requested step has saved. Rejects with 404 when the profile is missing, with 400 when a changed
   * reference is not assignable, with 409 when an HR account would deactivate itself, and with EMPLOYEE_UPDATE_INCOMPLETE
   * (503) when a step failed after the update had started; the details say which steps saved.
   */
  updateEmployee(command: EmployeeUpdateCommand): Promise<EmployeeUpdateResult>;
}
