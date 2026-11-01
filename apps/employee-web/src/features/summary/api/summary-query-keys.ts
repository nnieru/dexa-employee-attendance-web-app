import type { AttendanceSummaryQuery } from '@dexa/contracts';

// Keyed by the request query, so each URL state (from, to, page) has its own cache entry.
export const summaryQueryKeys = {
  all: ['attendance', 'summary'] as const,
  list: (query: AttendanceSummaryQuery) => [...summaryQueryKeys.all, query] as const,
};
