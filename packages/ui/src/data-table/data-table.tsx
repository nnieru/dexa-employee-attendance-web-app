import { useId, type ReactNode } from 'react';
import {
  useTable,
  type ColumnDef,
  type PaginationState,
  type RowData,
} from '@tanstack/react-table';
import { DataTableBody } from './data-table-body.js';
import { dataTableFeatures, type DataTableFeatures } from './data-table-features.js';
import { Pagination } from './pagination.js';

/**
 * Build columns with createColumnHelper<DataTableFeatures, TRow>().columns([...]). The helper types
 * each column's value as `any`, so columns with mixed value types fit one array without a cast.
 */
export type DataTableColumn<TRow extends RowData> = ColumnDef<DataTableFeatures, TRow>;

/**
 * - ready: show the rows, or the empty message when there are none.
 * - loading: the first load. Rows are replaced by one loading cell, even if data is passed.
 * - refreshing: a reload of rows already on screen. Keeps the current rows visible, marks the table
 *   busy, announces an updating indicator, and disables pagination until the reload settles.
 * - error: replaces the rows with an alert and an optional retry action.
 */
export type DataTableStatus =
  | { kind: 'ready' }
  | { kind: 'loading' }
  | { kind: 'refreshing' }
  | { kind: 'error'; message: string; onRetry?: () => void };

export type DataTablePagination = {
  /** One-based page number, the same numbering the API uses. */
  page: number;
  pageSize: number;
  /** Total pages reported by the API. */
  pageCount: number;
  onPageChange: (page: number) => void;
};

export type DataTableProps<TRow extends RowData> = {
  caption: string;
  columns: Array<DataTableColumn<TRow>>;
  data: Array<TRow>;
  emptyMessage: string;
  /** Must return a stable id per record. Array indexes are not allowed as row keys. */
  getRowId: (row: TRow) => string;
  /** The caption is visually hidden by default and still names the table for assistive technology. */
  isCaptionVisible?: boolean;
  loadingMessage?: string;
  pagination: DataTablePagination;
  /** Optional text on the left of the pager, for example "41 records". Passed to Pagination. */
  paginationSummary?: ReactNode;
  status?: DataTableStatus;
};

const READY_STATUS: DataTableStatus = { kind: 'ready' };
const REFRESHING_MESSAGE = 'Updating records…';

/**
 * Renders a semantic table with server-side pagination. The caller owns fetching, the page number,
 * and the status. The body shows exactly one of loading, error, empty, or the rows; refreshing shows
 * the rows with an updating indicator.
 */
export function DataTable<TRow extends RowData>({
  caption,
  columns,
  data,
  emptyMessage,
  getRowId,
  isCaptionVisible = false,
  loadingMessage,
  pagination,
  paginationSummary,
  status = READY_STATUS,
}: DataTableProps<TRow>) {
  const captionId = useId();
  const table = useTable({
    features: dataTableFeatures,
    columns,
    data,
    getRowId,
    manualPagination: true,
    pageCount: pagination.pageCount,
    state: { pagination: toPaginationState(pagination) },
  });
  const isLoading = status.kind === 'loading';
  const isRefreshing = status.kind === 'refreshing';
  const isBusy = isLoading || isRefreshing;

  return (
    <div className="dexa-data-table">
      {/* Mounted in every state so the live region already exists when its text changes. */}
      <p role="status" className="dexa-data-table__refreshing">
        {isRefreshing ? REFRESHING_MESSAGE : ''}
      </p>
      <div
        className="dexa-data-table__scroll"
        role="region"
        aria-labelledby={captionId}
        tabIndex={0}
      >
        <table className="dexa-data-table__table" aria-busy={isBusy}>
          <caption
            id={captionId}
            className={
              isCaptionVisible
                ? 'dexa-data-table__caption'
                : 'dexa-data-table__caption dexa-data-table__caption--hidden'
            }
          >
            {caption}
          </caption>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} scope="col" colSpan={header.colSpan}>
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <DataTableBody
            table={table}
            status={status}
            emptyMessage={emptyMessage}
            loadingMessage={loadingMessage}
          />
        </table>
      </div>
      <Pagination
        isDisabled={isBusy}
        onPageChange={pagination.onPageChange}
        page={pagination.page}
        pageCount={pagination.pageCount}
        summary={paginationSummary}
      />
    </div>
  );
}

function toPaginationState(pagination: DataTablePagination): PaginationState {
  return { pageIndex: pagination.page - 1, pageSize: pagination.pageSize };
}
