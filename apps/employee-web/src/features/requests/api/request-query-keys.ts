import type { OwnRequestListQuery } from '@dexa/contracts';

// Keyed by the request query, so each URL state (type, status, page) has its own cache entry.
export const requestQueryKeys = {
  all: ['requests', 'own'] as const,
  // Every overtime list, whatever its query. A submission invalidates this prefix, so each list page refetches.
  overtimeLists: () => [...requestQueryKeys.all, 'overtime'] as const,
  overtimeList: (query: OwnRequestListQuery) =>
    [...requestQueryKeys.overtimeLists(), query] as const,
  correctionList: (query: OwnRequestListQuery) =>
    [...requestQueryKeys.all, 'corrections', query] as const,
};
