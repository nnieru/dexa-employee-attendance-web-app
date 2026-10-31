import { Button } from '../button.js';

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
};

const DEFAULT_LABEL = 'Pagination';

/**
 * Previous and next controls with a page indicator. The caller owns the page number and fetching;
 * this control only reports the page the user asks for.
 */
export function Pagination({
  isDisabled = false,
  label = DEFAULT_LABEL,
  onPageChange,
  page,
  pageCount,
}: PaginationProps) {
  const lastPage = Math.max(pageCount, 1);
  const isFirstPage = page <= 1;
  const isLastPage = page >= lastPage;

  return (
    <nav aria-label={label} className="dexa-pagination">
      <Button
        variant="secondary"
        disabled={isDisabled || isFirstPage}
        onClick={() => onPageChange(page - 1)}
      >
        Previous
      </Button>
      <p className="dexa-pagination__status">{`Page ${page} of ${lastPage}`}</p>
      <Button
        variant="secondary"
        disabled={isDisabled || isLastPage}
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </Button>
    </nav>
  );
}
