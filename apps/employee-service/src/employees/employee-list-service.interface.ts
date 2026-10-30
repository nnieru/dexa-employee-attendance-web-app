import type { EmployeeListPage, EmployeeListQuery } from '@dexa/contracts';

export const EMPLOYEE_LIST_SERVICE = Symbol('IEmployeeListService');

/** The HR employee list (ADM-3). The caller's role is checked before this port is reached. */
export interface IEmployeeListService {
  listEmployees(query: EmployeeListQuery): Promise<EmployeeListPage>;
}
