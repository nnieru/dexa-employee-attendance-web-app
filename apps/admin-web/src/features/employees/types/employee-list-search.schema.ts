import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@dexa/contracts';
import { z } from 'zod';

const DEFAULT_PAGE = 1;
const DEFAULT_SEARCH_TERM = '';
// Matches the search term limit in the employee list contract (accounts.company_email, varchar(254)).
const SEARCH_TERM_MAX_LENGTH = 254;
const SEARCH_TERM_TOO_LONG_MESSAGE = 'Use 254 characters or fewer.';

/**
 * The list state in the URL. Each key is optional and an unusable value is dropped (`.catch`), so a stale or
 * hand-edited link still opens the list. The defaults are applied by resolveEmployeeListSearch, not written into
 * the URL, so the address stays as short as the user typed it (for example in a sign-in redirect).
 */
export const employeeListSearchSchema = z.object({
  q: z.string().trim().max(SEARCH_TERM_MAX_LENGTH).optional().catch(undefined),
  page: z.coerce.number().int().min(1).optional().catch(undefined),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional().catch(undefined),
});

export type EmployeeListSearch = z.infer<typeof employeeListSearchSchema>;

export type ResolvedEmployeeListSearch = {
  q: string;
  page: number;
  pageSize: number;
};

export function resolveEmployeeListSearch(search: EmployeeListSearch): ResolvedEmployeeListSearch {
  return {
    q: search.q ?? DEFAULT_SEARCH_TERM,
    page: search.page ?? DEFAULT_PAGE,
    pageSize: search.pageSize ?? DEFAULT_PAGE_SIZE,
  };
}

/**
 * The search box's own validation. Unlike the URL schema, it reports a too-long term instead of dropping it,
 * so the user sees why the search did not run.
 */
export const employeeSearchFormSchema = z.object({
  q: z.string().trim().max(SEARCH_TERM_MAX_LENGTH, { message: SEARCH_TERM_TOO_LONG_MESSAGE }),
});

export type EmployeeSearchFormValues = z.infer<typeof employeeSearchFormSchema>;
