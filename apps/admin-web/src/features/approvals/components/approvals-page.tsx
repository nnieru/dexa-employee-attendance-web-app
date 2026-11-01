import type { ReactNode } from 'react';
import type { RequestStatus } from '@dexa/contracts';
import type { DateRange } from '@dexa/ui';
import { PageShell } from '@dexa/ui';
import { useEmployeeOptions } from '../hooks/use-employee-options.js';
import type { ApprovalTab, ResolvedApprovalsSearch } from '../types/approvals-search.schema.js';
import { APPROVALS_PAGE_DESCRIPTION, APPROVALS_PAGE_TITLE } from '../utils/approval-messages.js';
import { getApprovalPanelId, getApprovalTabId, ApprovalTabs } from './approval-tabs.js';
import { ApprovalFilters } from './approval-filters.js';
import { CorrectionApprovalTable } from './correction-approval-table.js';
import { OvertimeApprovalTable } from './overtime-approval-table.js';

type ApprovalsPageProps = {
  search: ResolvedApprovalsSearch;
  /** Today in the company timezone. The route reads the clock, so this page stays a function of its props. */
  today: string;
  onTabChange: (tab: ApprovalTab) => void;
  onRangeSearch: (range: DateRange) => void;
  onStatusChange: (status: RequestStatus) => void;
  onEmployeeChange: (employeeId: string) => void;
  onPageChange: (page: number) => void;
};

/**
 * The HR approvals queue (PRD APR-1). The URL owns the tab, filters, and page; this component reflects them. Only the
 * selected type is mounted, so the other queue is not requested.
 */
export function ApprovalsPage({
  search,
  today,
  onTabChange,
  onRangeSearch,
  onStatusChange,
  onEmployeeChange,
  onPageChange,
}: ApprovalsPageProps) {
  const employeeOptions = useEmployeeOptions();

  return (
    <PageShell as="div" title={APPROVALS_PAGE_TITLE} description={APPROVALS_PAGE_DESCRIPTION}>
      <ApprovalTabs activeTab={search.tab} onTabChange={onTabChange} />
      <ApprovalFilters
        range={{ from: search.from, to: search.to }}
        today={today}
        status={search.status}
        employeeId={search.employeeId}
        employeeOptions={employeeOptions}
        onRangeSearch={onRangeSearch}
        onStatusChange={onStatusChange}
        onEmployeeChange={onEmployeeChange}
      />
      <TabPanel tab="overtime" activeTab={search.tab}>
        <OvertimeApprovalTable search={search} onPageChange={onPageChange} />
      </TabPanel>
      <TabPanel tab="corrections" activeTab={search.tab}>
        <CorrectionApprovalTable search={search} onPageChange={onPageChange} />
      </TabPanel>
    </PageShell>
  );
}

function TabPanel({
  tab,
  activeTab,
  children,
}: {
  tab: ApprovalTab;
  activeTab: ApprovalTab;
  children: ReactNode;
}) {
  const isSelected = tab === activeTab;
  return (
    <div
      role="tabpanel"
      id={getApprovalPanelId(tab)}
      aria-labelledby={getApprovalTabId(tab)}
      hidden={!isSelected}
    >
      {isSelected ? children : null}
    </div>
  );
}
