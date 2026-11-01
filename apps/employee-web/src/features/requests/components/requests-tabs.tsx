import type { KeyboardEvent } from 'react';
import { REQUEST_TABS, type RequestTab } from '../types/requests-search.schema.js';
import { getNextRequestTab } from '../utils/get-next-request-tab.js';
import { REQUEST_TAB_LABEL } from '../utils/requests-messages.js';

type RequestsTabsProps = {
  activeTab: RequestTab;
  onTabChange: (tab: RequestTab) => void;
};

export function getRequestTabId(tab: RequestTab): string {
  return `requests-tab-${tab}`;
}

export function getRequestPanelId(tab: RequestTab): string {
  return `requests-panel-${tab}`;
}

/**
 * The Overtime and Corrections switch, as a tablist (WAI-ARIA tabs pattern). Only the selected tab is in the page tab
 * order. The arrow keys, Home and End move focus to another tab and select it, so the URL follows the focus.
 */
export function RequestsTabs({ activeTab, onTabChange }: RequestsTabsProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentTab: RequestTab) {
    const nextTab = getNextRequestTab(currentTab, event.key);
    if (nextTab === undefined) return;
    event.preventDefault();
    onTabChange(nextTab);
    document.getElementById(getRequestTabId(nextTab))?.focus();
  }

  return (
    <div role="tablist" aria-label="Request type" className="dexa-request-tabs">
      {REQUEST_TABS.map((tab) => {
        const isSelected = tab === activeTab;
        return (
          <button
            key={tab}
            id={getRequestTabId(tab)}
            type="button"
            role="tab"
            className="dexa-request-tab"
            aria-selected={isSelected}
            aria-controls={getRequestPanelId(tab)}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onTabChange(tab)}
            onKeyDown={(event) => handleKeyDown(event, tab)}
          >
            {REQUEST_TAB_LABEL[tab]}
          </button>
        );
      })}
    </div>
  );
}
