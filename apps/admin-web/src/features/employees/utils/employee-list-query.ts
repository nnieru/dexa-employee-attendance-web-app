import type { EmployeeListQuery } from '@dexa/contracts';
import type { ResolvedEmployeeListSearch } from '../types/employee-list-search.schema.js';

/** Turns the resolved URL state into the API query. A blank search term is left out, so the API lists every employee. */
export function toEmployeeListQuery(search: ResolvedEmployeeListSearch): EmployeeListQuery {
  return {
    page: search.page,
    pageSize: search.pageSize,
    q: search.q.length > 0 ? search.q : undefined,
  };
}
