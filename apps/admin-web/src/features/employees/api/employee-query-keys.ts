import type { EmployeeListQuery } from '@dexa/contracts';

// Keyed by the request query, so each URL state (q, page, pageSize) has its own cache entry.
export const employeeQueryKeys = {
  all: ['employees'] as const,
  lists: () => [...employeeQueryKeys.all, 'list'] as const,
  list: (query: EmployeeListQuery) => [...employeeQueryKeys.lists(), query] as const,
  // One employee's HR view (ADM-2). Keyed by account ID, so each edit page has its own entry.
  details: () => [...employeeQueryKeys.all, 'detail'] as const,
  detail: (accountId: string) => [...employeeQueryKeys.details(), accountId] as const,
  // Keyed by the sorted account IDs of one page, so the same page reuses its thumbnails.
  photoThumbnails: (accountIds: ReadonlyArray<string>) =>
    [...employeeQueryKeys.all, 'photo-thumbnails', accountIds] as const,
  // The HR pickers. They are small catalogs, so one entry per catalog is enough.
  positions: () => [...employeeQueryKeys.all, 'positions'] as const,
  employeeStatuses: () => [...employeeQueryKeys.all, 'employee-statuses'] as const,
  // The signed-in HR account, used only to tell whether an edit targets the HR's own account.
  currentAccount: () => [...employeeQueryKeys.all, 'current-account'] as const,
};
