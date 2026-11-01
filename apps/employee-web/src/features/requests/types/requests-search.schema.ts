import { requestStatusSchema, type RequestStatus } from '@dexa/contracts';
import { z } from 'zod';

export const REQUEST_TABS = ['overtime', 'corrections'] as const;

const requestTabSchema = z.enum(REQUEST_TABS);

export type RequestTab = z.infer<typeof requestTabSchema>;

const DEFAULT_REQUEST_TAB: RequestTab = 'overtime';

const FIRST_PAGE = 1;

/**
 * The Requests state in the URL (PRD APR-6). Each key is optional and an unusable value is dropped (`.catch`), so a
 * stale or hand-edited link still opens the page. The defaults are applied by resolveRequestsSearch, not written into
 * the URL, so the address stays as short as the employee left it (for example in a sign-in redirect).
 */
export const requestsSearchSchema = z.object({
  tab: requestTabSchema.optional().catch(undefined),
  status: requestStatusSchema.optional().catch(undefined),
  page: z.coerce.number().int().min(FIRST_PAGE).optional().catch(undefined),
});

type RequestsSearch = z.infer<typeof requestsSearchSchema>;

export type ResolvedRequestsSearch = {
  tab: RequestTab;
  /** undefined means every status ("All"). */
  status: RequestStatus | undefined;
  page: number;
};

/** Fills the defaults: the Overtime tab, every status, and page 1. */
export function resolveRequestsSearch(search: RequestsSearch): ResolvedRequestsSearch {
  return {
    tab: search.tab ?? DEFAULT_REQUEST_TAB,
    status: search.status,
    page: search.page ?? FIRST_PAGE,
  };
}
