import type { RequestReviewQueueQuery } from '@dexa/contracts';

// Keyed by the request query, so each URL state (status, employee, range, page) has its own cache entry.
export const approvalQueryKeys = {
  all: ['approvals'] as const,
  overtime: {
    lists: () => [...approvalQueryKeys.all, 'overtime', 'list'] as const,
    list: (query: RequestReviewQueueQuery) =>
      [...approvalQueryKeys.overtime.lists(), query] as const,
    details: () => [...approvalQueryKeys.all, 'overtime', 'detail'] as const,
    detail: (requestId: string) => [...approvalQueryKeys.overtime.details(), requestId] as const,
  },
  correction: {
    lists: () => [...approvalQueryKeys.all, 'correction', 'list'] as const,
    list: (query: RequestReviewQueueQuery) =>
      [...approvalQueryKeys.correction.lists(), query] as const,
    details: () => [...approvalQueryKeys.all, 'correction', 'detail'] as const,
    detail: (requestId: string) => [...approvalQueryKeys.correction.details(), requestId] as const,
  },
  employeeOptions: () => [...approvalQueryKeys.all, 'employee-options'] as const,
};
