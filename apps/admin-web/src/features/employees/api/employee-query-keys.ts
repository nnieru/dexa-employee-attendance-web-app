import type { EmployeeListQuery } from '@dexa/contracts';

// Keyed by the request query, so each URL state (q, page, pageSize) has its own cache entry.
export const employeeQueryKeys = {
  all: ['employees'] as const,
  lists: () => [...employeeQueryKeys.all, 'list'] as const,
  list: (query: EmployeeListQuery) => [...employeeQueryKeys.lists(), query] as const,
  // Keyed by the sorted account IDs of one page, so the same page reuses its thumbnails.
  photoThumbnails: (accountIds: ReadonlyArray<string>) =>
    [...employeeQueryKeys.all, 'photo-thumbnails', accountIds] as const,
};
