import type { OwnRequestListQuery } from '@dexa/contracts';

// An absent status is omitted, not sent empty, so attendance-service lists every status (APR-6).
export function toRequestListQueryParameters(query: OwnRequestListQuery): Record<string, string> {
  const parameters: Record<string, string> = {
    page: String(query.page),
    pageSize: String(query.pageSize),
  };
  if (query.status !== undefined) parameters.status = query.status;
  return parameters;
}
