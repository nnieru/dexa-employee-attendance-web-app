import type { OwnRequestListQuery } from '@dexa/contracts';
import { DEFAULT_PAGE_SIZE } from '@dexa/contracts';
import type { ResolvedRequestsSearch } from '../types/requests-search.schema.js';

/** The API query for one URL state. "All" leaves the status key out, so the API returns every status. */
export function toOwnRequestListQuery(search: ResolvedRequestsSearch): OwnRequestListQuery {
  const query: OwnRequestListQuery = { page: search.page, pageSize: DEFAULT_PAGE_SIZE };
  if (search.status === undefined) return query;
  return { ...query, status: search.status };
}
