import type { KeyboardEvent } from 'react';
import { APPROVAL_TABS, type ApprovalTab } from '../types/approvals-search.schema.js';
import { REQUEST_TYPE_LABEL } from '../utils/approval-messages.js';

type ApprovalTabsProps = {
  activeTab: ApprovalTab;
  onTabChange: (tab: ApprovalTab) => void;
};

const FIRST_TAB: ApprovalTab = 'overtime';
const LAST_TAB: ApprovalTab = 'corrections';

export function getApprovalTabId(tab: ApprovalTab): string {
  return `approvals-tab-${tab}`;
}

export function getApprovalPanelId(tab: ApprovalTab): string {
  return `approvals-panel-${tab}`;
}

/** The Overtime and Corrections switch, as a tablist (WAI-ARIA tabs pattern). */
export function ApprovalTabs({ activeTab, onTabChange }: ApprovalTabsProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentTab: ApprovalTab) {
    const index = APPROVAL_TABS.indexOf(currentTab);
    if (event.key === 'Home') {
      event.preventDefault();
      onTabChange(FIRST_TAB);
      document.getElementById(getApprovalTabId(FIRST_TAB))?.focus();
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      onTabChange(LAST_TAB);
      document.getElementById(getApprovalTabId(LAST_TAB))?.focus();
      return;
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const nextTab =
      APPROVAL_TABS[(index + direction + APPROVAL_TABS.length) % APPROVAL_TABS.length] ??
      currentTab;
    onTabChange(nextTab);
    document.getElementById(getApprovalTabId(nextTab))?.focus();
  }

  return (
    <div role="tablist" aria-label="Request type" className="requests-tabs">
      {APPROVAL_TABS.map((tab) => {
        const isSelected = tab === activeTab;
        return (
          <button
            key={tab}
            id={getApprovalTabId(tab)}
            type="button"
            role="tab"
            className="requests-tab"
            aria-selected={isSelected}
            aria-controls={getApprovalPanelId(tab)}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onTabChange(tab)}
            onKeyDown={(event) => handleKeyDown(event, tab)}
          >
            {REQUEST_TYPE_LABEL[tab]}
          </button>
        );
      })}
    </div>
  );
}
