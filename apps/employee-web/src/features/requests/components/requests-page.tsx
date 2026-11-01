import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import type { RequestStatus } from '@dexa/contracts';
import { PageShell } from '@dexa/ui';
import type { RequestTab, ResolvedRequestsSearch } from '../types/requests-search.schema.js';
import {
  REQUESTS_PAGE_DESCRIPTION,
  REQUESTS_PAGE_TITLE,
  CREATE_CORRECTION_LABEL,
  CREATE_OVERTIME_LABEL,
} from '../utils/requests-messages.js';
import { CorrectionRequestsTable } from './correction-requests-table.js';
import { OvertimeRequestsTable } from './overtime-requests-table.js';
import { RequestStatusFilter } from './request-status-filter.js';
import { getRequestPanelId, getRequestTabId, RequestsTabs } from './requests-tabs.js';

type RequestsPageProps = {
  search: ResolvedRequestsSearch;
  onTabChange: (tab: RequestTab) => void;
  onStatusChange: (status: RequestStatus | undefined) => void;
  onPageChange: (page: number) => void;
};

/**
 * The employee's requests (PRD APR-6). The URL owns the tab, the status and the page; this component reflects them.
 * Only the selected tab's table is mounted, so the other type's list is not requested.
 */
export function RequestsPage({
  search,
  onTabChange,
  onStatusChange,
  onPageChange,
}: RequestsPageProps) {
  return (
    <PageShell as="div" title={REQUESTS_PAGE_TITLE} description={REQUESTS_PAGE_DESCRIPTION}>
      <div className="requests-page__actions">
        <Link to="/requests/overtime/new" className="dexa-button dexa-button--secondary">
          <span className="dexa-button__label">{CREATE_OVERTIME_LABEL}</span>
        </Link>
        <Link to="/requests/corrections/new" className="dexa-button dexa-button--secondary">
          <span className="dexa-button__label">{CREATE_CORRECTION_LABEL}</span>
        </Link>
      </div>
      <RequestsTabs activeTab={search.tab} onTabChange={onTabChange} />
      <RequestStatusFilter status={search.status} onStatusChange={onStatusChange} />
      <TabPanel tab="overtime" activeTab={search.tab}>
        <OvertimeRequestsTable search={search} onPageChange={onPageChange} />
      </TabPanel>
      <TabPanel tab="corrections" activeTab={search.tab}>
        <CorrectionRequestsTable search={search} onPageChange={onPageChange} />
      </TabPanel>
    </PageShell>
  );
}

/** Renders its children only for the selected tab. The inactive panel stays in the DOM so aria-controls always resolves. */
function TabPanel({
  tab,
  activeTab,
  children,
}: {
  tab: RequestTab;
  activeTab: RequestTab;
  children: ReactNode;
}) {
  const isSelected = tab === activeTab;
  return (
    <div
      role="tabpanel"
      id={getRequestPanelId(tab)}
      aria-labelledby={getRequestTabId(tab)}
      hidden={!isSelected}
    >
      {isSelected ? children : null}
    </div>
  );
}
