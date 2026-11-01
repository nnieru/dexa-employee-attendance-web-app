import { REQUEST_TABS, type RequestTab } from '../types/requests-search.schema.js';

const LAST_TAB_INDEX = REQUEST_TABS.length - 1;

/**
 * The tab that a key press moves to in the tablist (WAI-ARIA tabs pattern): arrows wrap around, Home and End jump to
 * the ends. Returns undefined for any other key, so the caller leaves the event alone.
 */
export function getNextRequestTab(currentTab: RequestTab, key: string): RequestTab | undefined {
  const nextIndex = getNextTabIndex(REQUEST_TABS.indexOf(currentTab), key);
  return nextIndex === undefined ? undefined : REQUEST_TABS[nextIndex];
}

function getNextTabIndex(currentIndex: number, key: string): number | undefined {
  if (key === 'ArrowRight') return currentIndex === LAST_TAB_INDEX ? 0 : currentIndex + 1;
  if (key === 'ArrowLeft') return currentIndex === 0 ? LAST_TAB_INDEX : currentIndex - 1;
  if (key === 'Home') return 0;
  if (key === 'End') return LAST_TAB_INDEX;
  return undefined;
}
