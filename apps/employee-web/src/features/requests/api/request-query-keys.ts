import type { OwnRequestListQuery } from '@dexa/contracts';

// Keyed by the request query, so each URL state (type, status, page) has its own cache entry.
export const requestQueryKeys = {
  all: ['requests', 'own'] as const,
  overtimeList: (query: OwnRequestListQuery) =>
    [...requestQueryKeys.all, 'overtime', query] as const,
  correctionList: (query: OwnRequestListQuery) =>
    [...requestQueryKeys.all, 'corrections', query] as const,
};
