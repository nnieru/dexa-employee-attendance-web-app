import { createColumnHelper, rowPaginationFeature, tableFeatures } from '@tanstack/react-table';
import type { ColumnHelper, RowData } from '@tanstack/react-table';

/**
 * Only the pagination row model is registered. Rows arrive already paged from the caller, so the
 * table never sorts, filters, or slices them itself.
 */
export const dataTableFeatures = tableFeatures({ rowPaginationFeature });

export type DataTableFeatures = typeof dataTableFeatures;

/**
 * Build columns with `helper.columns([...])`, not a plain array. `columns` keeps each column's own
 * value type, so columns with different value types fit one array without a cast.
 */
export function createDataTableColumnHelper<TRow extends RowData>(): ColumnHelper<
  DataTableFeatures,
  TRow
> {
  return createColumnHelper<DataTableFeatures, TRow>();
}
