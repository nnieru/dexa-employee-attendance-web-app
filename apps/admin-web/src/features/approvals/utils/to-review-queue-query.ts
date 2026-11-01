import { DEFAULT_PAGE_SIZE, type RequestReviewQueueQuery } from '@dexa/contracts';
import type { ResolvedApprovalsSearch } from '../types/approvals-search.schema.js';

/** The API query for one URL state. The page size is not in the URL, so it is the shared default. */
export function toReviewQueueQuery(search: ResolvedApprovalsSearch): RequestReviewQueueQuery {
  return {
    status: search.status,
    employeeId: search.employeeId,
    from: search.from,
    to: search.to,
    page: search.page,
    pageSize: DEFAULT_PAGE_SIZE,
  };
}
