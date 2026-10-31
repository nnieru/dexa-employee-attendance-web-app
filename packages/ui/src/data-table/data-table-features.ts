import { rowPaginationFeature, tableFeatures } from '@tanstack/react-table';

/**
 * Only the pagination row model is registered. Rows arrive already paged from the caller, so the
 * table never sorts, filters, or slices them itself.
 */
export const dataTableFeatures = tableFeatures({ rowPaginationFeature });

export type DataTableFeatures = typeof dataTableFeatures;
