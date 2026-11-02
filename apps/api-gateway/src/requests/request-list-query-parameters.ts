import type { OwnRequestListQuery, RequestReviewQueueQuery } from '@dexa/contracts';

// An absent status is omitted, not sent empty, so attendance-service lists every status.
export function toRequestListQueryParameters(query: OwnRequestListQuery): Record<string, string> {
  const parameters: Record<string, string> = {
    page: String(query.page),
    pageSize: String(query.pageSize),
  };
  if (query.status !== undefined) parameters.status = query.status;
  return parameters;
}

// The status always has a value here, because the queue defaults it to PENDING. Absent filters are omitted, not sent
// empty, so attendance-service applies no filter for them.
export function toRequestReviewQueueQueryParameters(
  query: RequestReviewQueueQuery,
): Record<string, string> {
  const parameters: Record<string, string> = {
    status: query.status,
    page: String(query.page),
    pageSize: String(query.pageSize),
  };
  if (query.employeeId !== undefined) parameters.employeeId = query.employeeId;
  if (query.from !== undefined) parameters.from = query.from;
  if (query.to !== undefined) parameters.to = query.to;
  return parameters;
}
