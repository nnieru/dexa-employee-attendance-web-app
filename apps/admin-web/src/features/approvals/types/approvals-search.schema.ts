import { requestStatusSchema, type RequestStatus } from '@dexa/contracts';
import { z } from 'zod';

export const APPROVAL_TABS = ['overtime', 'corrections'] as const;

export const approvalTabSchema = z.enum(APPROVAL_TABS);

export type ApprovalTab = z.infer<typeof approvalTabSchema>;

const FIRST_PAGE = 1;
const DEFAULT_TAB: ApprovalTab = 'overtime';
const DEFAULT_STATUS: RequestStatus = 'PENDING';
const YEAR_MONTH_LENGTH = 7;

/**
 * The approvals state in the URL (PRD APR-1). Each key is optional and an unusable value is dropped (`.catch`), so a
 * stale or hand-edited link still opens the queue. The defaults are applied by resolveApprovalsSearch, not written
 * into the URL.
 */
export const approvalsSearchSchema = z.object({
  tab: approvalTabSchema.optional().catch(undefined),
  status: requestStatusSchema.optional().catch(undefined),
  employeeId: z.uuid().optional().catch(undefined),
  from: z.iso.date().optional().catch(undefined),
  to: z.iso.date().optional().catch(undefined),
  page: z.coerce.number().int().min(FIRST_PAGE).optional().catch(undefined),
});

export type ApprovalsSearch = z.infer<typeof approvalsSearchSchema>;

export type ResolvedApprovalsSearch = {
  tab: ApprovalTab;
  status: RequestStatus;
  employeeId: string | undefined;
  from: string;
  to: string;
  page: number;
};

/** Fills the defaults: the Overtime tab, Pending status, the first of the WIB month through today, and page 1. */
export function resolveApprovalsSearch(
  search: ApprovalsSearch,
  today: string,
): ResolvedApprovalsSearch {
  return {
    tab: search.tab ?? DEFAULT_TAB,
    status: search.status ?? DEFAULT_STATUS,
    employeeId: search.employeeId,
    from: search.from ?? `${today.slice(0, YEAR_MONTH_LENGTH)}-01`,
    to: search.to ?? today,
    page: search.page ?? FIRST_PAGE,
  };
}
