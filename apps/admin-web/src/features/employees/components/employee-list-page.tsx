import { useMemo } from 'react';
import { DataTable, PageShell } from '@dexa/ui';
import type { EmployeeListItem } from '@dexa/contracts';
import { useEmployeeList } from '../hooks/use-employee-list.js';
import { useEmployeePhotoThumbnails } from '../hooks/use-employee-photo-thumbnails.js';
import {
  resolveEmployeeListSearch,
  type EmployeeListSearch,
} from '../types/employee-list-search.schema.js';
import { toEmployeeListQuery } from '../utils/employee-list-query.js';
import {
  getEmployeeEmptyMessage,
  getEmployeeTableStatus,
} from '../utils/employee-list-messages.js';
import { createEmployeeListColumns } from './employee-list-columns.js';
import { EmployeeSearchForm } from './employee-search-form.js';

type EmployeeListPageProps = {
  search: EmployeeListSearch;
  onSearch: (searchTerm: string) => void;
  onPageChange: (page: number) => void;
};

const NO_ROWS: Array<EmployeeListItem> = [];

function getEmployeeRowId(employee: EmployeeListItem): string {
  return employee.accountId;
}

/** HR employee list (ADM-3). The URL owns the search and the page; this component only reflects them. */
export function EmployeeListPage({ search, onSearch, onPageChange }: EmployeeListPageProps) {
  const resolvedSearch = resolveEmployeeListSearch(search);
  const employeeList = useEmployeeList(toEmployeeListQuery(resolvedSearch));
  const page = employeeList.data;
  const items = page?.items ?? NO_ROWS;
  const totalItems = page?.totalItems ?? 0;
  // The thumbnails start only once this page's rows have arrived, and never wait for them: the list is already shown.
  const photoThumbnails = useEmployeePhotoThumbnails({
    accountIds: items.map((employee) => employee.accountId),
    isEnabled: employeeList.isSuccess && !employeeList.isPlaceholderData,
  });
  const columns = useMemo(
    () => createEmployeeListColumns(photoThumbnails.data),
    [photoThumbnails.data],
  );

  return (
    <PageShell
      as="div"
      title="Employees"
      description="Search employee accounts by name or company email."
    >
      <EmployeeSearchForm searchTerm={resolvedSearch.q} onSearch={onSearch} />
      <DataTable
        caption="Employees"
        columns={columns}
        data={items}
        emptyMessage={getEmployeeEmptyMessage({ searchTerm: resolvedSearch.q, totalItems })}
        getRowId={getEmployeeRowId}
        pagination={{
          page: resolvedSearch.page,
          pageSize: resolvedSearch.pageSize,
          pageCount: page?.totalPages ?? 0,
          onPageChange,
        }}
        paginationSummary={page === undefined ? undefined : `Total: ${totalItems}`}
        status={getEmployeeTableStatus({
          hasError: employeeList.isError,
          isFetching: employeeList.isFetching,
          isPending: employeeList.isPending,
          onRetry: () => void employeeList.refetch(),
        })}
      />
    </PageShell>
  );
}
