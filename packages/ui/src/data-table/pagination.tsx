import type { ReactNode } from 'react';
import { IconButton } from '../icon-button.js';

export type PaginationProps = {
  /** Disables both controls, for example while the page is loading. */
  isDisabled?: boolean;
  /** Accessible name of the navigation landmark. */
  label?: string;
  /** Receives the one-based page number to show. */
  onPageChange: (page: number) => void;
  /** One-based current page. */
  page: number;
  /** Total pages from the API. Values below 1 are shown as a single page. */
  pageCount: number;
  /** Optional text on the left of the row, for example "41 records". */
  summary?: ReactNode;
};

const DEFAULT_LABEL = 'Pagination';

/**
 * Pager row as in the mockup: optional summary on the left, and on the right the previous icon
 * button, the page indicator, and the next icon button. The caller owns the page number and
 * fetching; this control only reports the page the user asks for.
 */
export function Pagination({
  isDisabled = false,
  label = DEFAULT_LABEL,
  onPageChange,
  page,
  pageCount,
  summary,
}: PaginationProps) {
  const lastPage = Math.max(pageCount, 1);
  const isFirstPage = page <= 1;
  const isLastPage = page >= lastPage;

  return (
    <nav aria-label={label} className="dexa-pagination">
      {summary !== undefined && summary !== null && (
        <p className="dexa-pagination__summary">{summary}</p>
      )}
      <div className="dexa-pagination__controls">
        <IconButton
          aria-label="Previous page"
          iconName="chevron-left"
          disabled={isDisabled || isFirstPage}
          onClick={() => onPageChange(page - 1)}
        />
        <span className="dexa-pagination__status">{`Page ${page} of ${lastPage}`}</span>
        <IconButton
          aria-label="Next page"
          iconName="chevron-right"
          disabled={isDisabled || isLastPage}
          onClick={() => onPageChange(page + 1)}
        />
      </div>
    </nav>
  );
}
