import type { AccountLookupItem, EmployeeDetail } from '@dexa/contracts';
import type { EmployeeDetailRecord } from './employee-provisioning.repository.interface.js';

/**
 * Builds the HR view of one employee. The email and role come from Auth, which owns them, and everything else
 * comes from the employee row. The result has no password, hash, or photo key.
 */
export function toEmployeeDetail(
  record: EmployeeDetailRecord,
  account: AccountLookupItem,
): EmployeeDetail {
  return {
    accountId: record.accountId,
    name: record.name,
    email: account.email,
    role: account.role,
    position: { ...record.position },
    employeeStatus: { ...record.employeeStatus },
    phoneNumber: record.phoneNumber,
    profileStatus: record.profileStatus,
  };
}
