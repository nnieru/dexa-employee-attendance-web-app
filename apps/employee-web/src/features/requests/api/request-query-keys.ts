import type { OwnRequestListQuery } from '@dexa/contracts';

// Keyed by the request query, so each URL state (type, status, page) has its own cache entry.
export const requestQueryKeys = {
  all: ['requests', 'own'] as const,
  // Every overtime list, whatever its query. A submission invalidates this prefix, so each list page refetches.
  overtimeLists: () => [...requestQueryKeys.all, 'overtime'] as const,
  overtimeList: (query: OwnRequestListQuery) =>
    [...requestQueryKeys.overtimeLists(), query] as const,
  // Every correction list, whatever its query, for the same reason as overtimeLists.
  correctionLists: () => [...requestQueryKeys.all, 'corrections'] as const,
  correctionList: (query: OwnRequestListQuery) =>
    [...requestQueryKeys.correctionLists(), query] as const,
  // The employee's own record for one business date, shown beside the correction form. Kept apart from the History
  // summary cache so this single-date read is not refetched by History, and the other way round.
  dayAttendanceLists: () => [...requestQueryKeys.all, 'day-attendance'] as const,
  dayAttendance: (businessDate: string) =>
    [...requestQueryKeys.dayAttendanceLists(), businessDate] as const,
};
