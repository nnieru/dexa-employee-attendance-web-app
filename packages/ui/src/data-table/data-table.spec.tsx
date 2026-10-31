import { expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable, type DataTablePagination } from './data-table.js';
import { createDataTableColumnHelper } from './data-table-features.js';

type AttendanceRow = {
  id: string;
  clockIn: string;
  employeeName: string;
};

const helper = createDataTableColumnHelper<AttendanceRow>();
const columns = helper.columns([
  helper.accessor('employeeName', { header: 'Employee' }),
  helper.accessor('clockIn', { header: 'Clock in' }),
]);
const rows: Array<AttendanceRow> = [
  { id: 'row-a', employeeName: 'Ada Lovelace', clockIn: '2026-11-02 08:55' },
  { id: 'row-b', employeeName: 'Grace Hopper', clockIn: '2026-11-02 09:10' },
];

function getRowId(row: AttendanceRow): string {
  return row.id;
}

function buildPagination(overrides: Partial<DataTablePagination> = {}): DataTablePagination {
  return {
    page: 1,
    pageSize: 20,
    pageCount: 5,
    onPageChange: vi.fn(),
    ...overrides,
  };
}

it('should render a header cell per column and a row per record when data is given', () => {
  render(
    <DataTable
      caption="Attendance"
      columns={columns}
      data={rows}
      emptyMessage="No attendance."
      getRowId={getRowId}
      pagination={buildPagination()}
    />,
  );

  expect(screen.getByRole('columnheader', { name: 'Employee' })).toHaveAttribute('scope', 'col');
  expect(screen.getByRole('columnheader', { name: 'Clock in' })).toHaveAttribute('scope', 'col');
  expect(screen.getAllByRole('row')).toHaveLength(3);
  expect(screen.getByRole('cell', { name: 'Ada Lovelace' })).toBeInTheDocument();
  expect(screen.getByRole('cell', { name: '2026-11-02 09:10' })).toBeInTheDocument();
});

it('should show the empty message and no records when data is empty', () => {
  render(
    <DataTable
      caption="Attendance"
      columns={columns}
      data={[]}
      emptyMessage="No attendance matches these filters."
      getRowId={getRowId}
      pagination={buildPagination({ pageCount: 1 })}
    />,
  );

  expect(screen.getByText('No attendance matches these filters.')).toBeInTheDocument();
  expect(screen.queryByRole('cell', { name: 'Ada Lovelace' })).not.toBeInTheDocument();
});

it('should show only the loading message and mark the table busy when status is loading', () => {
  render(
    <DataTable
      caption="Attendance"
      columns={columns}
      data={rows}
      emptyMessage="No attendance."
      getRowId={getRowId}
      pagination={buildPagination()}
      status={{ kind: 'loading' }}
    />,
  );

  expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByText('Loading records…')).toHaveAttribute('role', 'status');
  expect(screen.queryByRole('cell', { name: 'Ada Lovelace' })).not.toBeInTheDocument();
  expect(screen.queryByText('No attendance.')).not.toBeInTheDocument();
});

it('should keep the rows visible and announce the update when status is refreshing', () => {
  render(
    <DataTable
      caption="Attendance"
      columns={columns}
      data={rows}
      emptyMessage="No attendance."
      getRowId={getRowId}
      pagination={buildPagination()}
      status={{ kind: 'refreshing' }}
    />,
  );

  expect(screen.getByRole('status')).toHaveTextContent('Updating records…');
  expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByRole('cell', { name: 'Ada Lovelace' })).toBeInTheDocument();
  expect(screen.getByRole('cell', { name: '2026-11-02 09:10' })).toBeInTheDocument();
  expect(screen.queryByText('Loading records…')).not.toBeInTheDocument();
});

it('should disable both pagination controls when status is refreshing', async () => {
  const user = userEvent.setup();
  const onPageChange = vi.fn();
  render(
    <DataTable
      caption="Attendance"
      columns={columns}
      data={rows}
      emptyMessage="No attendance."
      getRowId={getRowId}
      pagination={buildPagination({ page: 2, onPageChange })}
      status={{ kind: 'refreshing' }}
    />,
  );

  expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Next page' }));
  expect(onPageChange).not.toHaveBeenCalled();
});

it('should keep the status element mounted with empty text and enable pagination when status is ready', () => {
  render(
    <DataTable
      caption="Attendance"
      columns={columns}
      data={rows}
      emptyMessage="No attendance."
      getRowId={getRowId}
      pagination={buildPagination({ page: 2 })}
    />,
  );

  expect(screen.getByRole('status')).toBeEmptyDOMElement();
  expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'false');
  expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled();
});

it('should show the loading cell and no rows when the first load is still in progress', () => {
  render(
    <DataTable
      caption="Attendance"
      columns={columns}
      data={[]}
      emptyMessage="No attendance."
      getRowId={getRowId}
      pagination={buildPagination()}
      status={{ kind: 'loading' }}
    />,
  );

  expect(screen.getByText('Loading records…')).toHaveAttribute('role', 'status');
  expect(screen.queryByText('Updating records…')).not.toBeInTheDocument();
  expect(screen.queryByText('No attendance.')).not.toBeInTheDocument();
});

it('should show only the error alert with retry and no records when status is error', async () => {
  const user = userEvent.setup();
  const onRetry = vi.fn();
  render(
    <DataTable
      caption="Attendance"
      columns={columns}
      data={rows}
      emptyMessage="No attendance."
      getRowId={getRowId}
      pagination={buildPagination()}
      status={{ kind: 'error', message: 'Attendance could not be loaded.', onRetry }}
    />,
  );

  expect(screen.getByRole('alert')).toHaveTextContent('Attendance could not be loaded.');
  expect(screen.queryByRole('cell', { name: 'Ada Lovelace' })).not.toBeInTheDocument();
  expect(screen.queryByText('No attendance.')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

it('should show the error alert without a retry button when no retry handler is given', () => {
  render(
    <DataTable
      caption="Attendance"
      columns={columns}
      data={[]}
      emptyMessage="No attendance."
      getRowId={getRowId}
      pagination={buildPagination()}
      status={{ kind: 'error', message: 'Attendance could not be loaded.' }}
    />,
  );

  expect(screen.getByRole('alert')).toHaveTextContent('Attendance could not be loaded.');
  expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
});

it('should call onPageChange with the next page when next is clicked on a middle page', async () => {
  const user = userEvent.setup();
  const onPageChange = vi.fn();
  render(
    <DataTable
      caption="Attendance"
      columns={columns}
      data={rows}
      emptyMessage="No attendance."
      getRowId={getRowId}
      pagination={buildPagination({ page: 2, onPageChange })}
    />,
  );

  await user.click(screen.getByRole('button', { name: 'Next page' }));

  expect(onPageChange).toHaveBeenCalledWith(3);
});

it('should call onPageChange with the previous page when previous is clicked', async () => {
  const user = userEvent.setup();
  const onPageChange = vi.fn();
  render(
    <DataTable
      caption="Attendance"
      columns={columns}
      data={rows}
      emptyMessage="No attendance."
      getRowId={getRowId}
      pagination={buildPagination({ page: 3, onPageChange })}
    />,
  );

  await user.click(screen.getByRole('button', { name: 'Previous page' }));

  expect(onPageChange).toHaveBeenCalledWith(2);
});

it('should expose the scroll region as focusable and named by the caption when rendered', () => {
  render(
    <DataTable
      caption="Attendance for November"
      columns={columns}
      data={rows}
      emptyMessage="No attendance."
      getRowId={getRowId}
      pagination={buildPagination()}
    />,
  );

  const region = screen.getByRole('region', { name: 'Attendance for November' });
  expect(region).toHaveAttribute('tabindex', '0');
  expect(within(region).getByRole('table')).toBeInTheDocument();
});

it('should name the table by its caption when the caption is visually hidden', () => {
  render(
    <DataTable
      caption="Attendance for November"
      columns={columns}
      data={rows}
      emptyMessage="No attendance."
      getRowId={getRowId}
      pagination={buildPagination()}
    />,
  );

  expect(screen.getByRole('table', { name: 'Attendance for November' })).toBeInTheDocument();
});

it('should give each body cell its column name for the narrow labeled layout', () => {
  render(
    <DataTable
      caption="Attendance records"
      columns={columns}
      data={rows}
      emptyMessage="No attendance."
      getRowId={getRowId}
      pagination={buildPagination({ pageCount: 1 })}
    />,
  );

  expect(screen.getByRole('cell', { name: 'Ada Lovelace' })).toHaveAttribute(
    'data-label',
    'Employee',
  );
});

it('should show the pagination summary when paginationSummary is given', () => {
  render(
    <DataTable
      caption="Attendance records"
      columns={columns}
      data={rows}
      emptyMessage="No attendance."
      getRowId={getRowId}
      pagination={buildPagination({ pageCount: 1 })}
      paginationSummary="2 records"
    />,
  );

  expect(screen.getByText('2 records')).toBeInTheDocument();
});

it('should render the cell of a display column built with the column helper when the column has no accessor', () => {
  const columnsWithDisplay = helper.columns([
    helper.accessor('employeeName', { header: 'Employee' }),
    helper.display({
      id: 'clockInLabel',
      header: 'Clock in label',
      cell: ({ row }) => `In ${row.original.clockIn}`,
    }),
  ]);
  render(
    <DataTable
      caption="Attendance records"
      columns={columnsWithDisplay}
      data={rows}
      emptyMessage="No attendance."
      getRowId={getRowId}
      pagination={buildPagination({ pageCount: 1 })}
    />,
  );

  expect(screen.getByRole('columnheader', { name: 'Clock in label' })).toBeInTheDocument();
  expect(screen.getByRole('cell', { name: 'In 2026-11-02 09:10' })).toBeInTheDocument();
});
