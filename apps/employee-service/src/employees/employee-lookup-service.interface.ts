import type { EmployeeLookupItem } from '@dexa/contracts';

export const EMPLOYEE_LOOKUP_SERVICE = Symbol('IEmployeeLookupService');

/** The batched employee lookup that other services call. The controller depends on this port only. */
export interface IEmployeeLookupService {
  lookupEmployees(accountIds: ReadonlyArray<string>): Promise<EmployeeLookupItem[]>;
}
