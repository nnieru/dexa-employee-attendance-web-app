import {
  API_PREFIX,
  type AccountLookupItem,
  type EmployeeListItem,
  type EmployeeListPage,
} from '@dexa/contracts';
import type { EmployeeListRecord } from './employee-list-reader.interface.js';

/**
 * Builds one HR list row from the employee row and the account that Auth answered for it. An account that Auth
 * did not answer for leaves the email and role null. The photo key is read only to decide the photo URL.
 */
export function toEmployeeListItem(
  record: EmployeeListRecord,
  account: AccountLookupItem | undefined,
): EmployeeListItem {
  return {
    accountId: record.accountId,
    name: record.name,
    email: account?.email ?? null,
    role: account?.role ?? null,
    position: { ...record.position },
    employeeStatus: { ...record.employeeStatus },
    phoneNumber: record.phoneNumber,
    profileStatus: record.profileStatus,
    photoUrl: record.photoKey === null ? null : toHrPhotoUrl(record.accountId),
  };
}

/** The page envelope. The last page count rounds up, so a partial last page still counts as a page. */
export function toEmployeeListPage(
  items: ReadonlyArray<EmployeeListItem>,
  pagination: { readonly page: number; readonly pageSize: number },
  totalItems: number,
): EmployeeListPage {
  return {
    items: [...items],
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / pagination.pageSize),
  };
}

// The HR view of another employee's photo. The account ID is a validated UUID, so it needs no escaping.
function toHrPhotoUrl(accountId: string): string {
  return `/${API_PREFIX}/employees/${accountId}/photo`;
}
