import type { AttendanceMonitoringQuery } from '@dexa/contracts';

// Keyed by the request query, so each URL state (from, to, employeeId, page) has its own cache entry.
export const attendanceQueryKeys = {
  all: ['attendance', 'monitoring'] as const,
  list: (query: AttendanceMonitoringQuery) => [...attendanceQueryKeys.all, query] as const,
  // The employee filter's options. One entry is enough: it is the same first page for every URL state.
  employeeOptions: () => ['attendance', 'employee-options'] as const,
};
