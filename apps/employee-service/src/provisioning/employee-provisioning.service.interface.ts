import type { CreateEmployeeRequest, EmployeeDetail } from '@dexa/contracts';

export const EMPLOYEE_PROVISIONING_SERVICE = Symbol('IEmployeeProvisioningService');

/** HR creates an employee and its login account. */
export interface IEmployeeProvisioningService {
  /**
   * Resolves with the employee once the account is ACTIVE. A matching retry under the same operation ID resolves
   * with the same employee, and it never overwrites a profile that changed after the first attempt.
   */
  createEmployee(actorAccountId: string, request: CreateEmployeeRequest): Promise<EmployeeDetail>;
}
