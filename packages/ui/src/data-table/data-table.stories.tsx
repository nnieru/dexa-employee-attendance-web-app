import { useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DataTable, type DataTableColumn, type DataTableStatus } from './data-table.js';
import type { DataTableFeatures } from './data-table-features.js';

type AttendanceRow = {
  id: string;
  employeeName: string;
  workDate: string;
  clockIn: string;
  clockOut: string;
  dayStatus: string;
  overtime: string;
  originalClockIn: string;
  originalClockOut: string;
  effectiveClockIn: string;
  effectiveClockOut: string;
};

const ATTENDANCE_ROWS: Array<AttendanceRow> = [
  {
    id: 'att-1',
    employeeName: 'Ada Lovelace',
    workDate: '2026-11-02',
    clockIn: '2026-11-02 08:55',
    clockOut: '2026-11-02 17:05',
    dayStatus: 'Present',
    overtime: 'Not required',
    originalClockIn: '2026-11-02 08:55',
    originalClockOut: '2026-11-02 16:40',
    effectiveClockIn: '2026-11-02 08:55',
    effectiveClockOut: '2026-11-02 17:05',
  },
  {
    id: 'att-2',
    employeeName: 'Grace Hopper',
    workDate: '2026-11-02',
    clockIn: '2026-11-02 09:10',
    clockOut: 'Not recorded yet',
    dayStatus: 'Awaiting record',
    overtime: 'Not required',
    originalClockIn: '2026-11-02 09:10',
    originalClockOut: 'Not recorded yet',
    effectiveClockIn: '2026-11-02 09:10',
    effectiveClockOut: 'Not recorded yet',
  },
];

const helper = createColumnHelper<DataTableFeatures, AttendanceRow>();

const BASIC_COLUMNS = helper.columns([
  helper.accessor('employeeName', { header: 'Employee' }),
  helper.accessor('workDate', { header: 'Date' }),
  helper.accessor('clockIn', { header: 'Clock in' }),
  helper.accessor('clockOut', { header: 'Clock out' }),
]);

const MANY_COLUMNS = helper.columns([
  helper.accessor('employeeName', { header: 'Employee' }),
  helper.accessor('workDate', { header: 'Date' }),
  helper.accessor('dayStatus', { header: 'Day status' }),
  helper.accessor('clockIn', { header: 'Clock in' }),
  helper.accessor('clockOut', { header: 'Clock out' }),
  helper.accessor('overtime', { header: 'Approved overtime' }),
  helper.accessor('originalClockIn', { header: 'Original clock in' }),
  helper.accessor('originalClockOut', { header: 'Original clock out' }),
  helper.accessor('effectiveClockIn', { header: 'Effective clock in' }),
  helper.accessor('effectiveClockOut', { header: 'Effective clock out' }),
]);

function noop(): void {
  return undefined;
}

type DataTableDemoProps = {
  columns: Array<DataTableColumn<AttendanceRow>>;
  emptyMessage: string;
  initialPage: number;
  pageCount: number;
  rows: Array<AttendanceRow>;
  status: DataTableStatus;
};

/** Holds the page locally so the pagination controls can be tried. Nothing is fetched. */
function DataTableDemo({
  columns,
  emptyMessage,
  initialPage,
  pageCount,
  rows,
  status,
}: DataTableDemoProps) {
  const [page, setPage] = useState(initialPage);

  return (
    <DataTable
      caption="Attendance records"
      columns={columns}
      data={rows}
      emptyMessage={emptyMessage}
      getRowId={(row) => row.id}
      pagination={{ page, pageSize: 20, pageCount, onPageChange: setPage }}
      status={status}
    />
  );
}

const meta = {
  title: 'Shared/DataTable',
  component: DataTableDemo,
  args: {
    columns: BASIC_COLUMNS,
    emptyMessage: 'No attendance matches these filters.',
    initialPage: 1,
    pageCount: 5,
    rows: ATTENDANCE_ROWS,
    status: { kind: 'ready' },
  },
  parameters: {
    docs: {
      description: {
        component:
          'Semantic table with a caption, column headers, and server-side pagination. The app owns fetching, the page number, and status; the table shows one of loading, error, empty, or the rows. Stories page locally and fetch nothing.',
      },
    },
  },
} satisfies Meta<typeof DataTableDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Rows: Story = {};

export const Loading: Story = {
  args: { status: { kind: 'loading' } },
};

export const Refreshing: Story = {
  args: { status: { kind: 'refreshing' } },
};

export const Empty: Story = {
  args: { rows: [], pageCount: 1 },
};

export const ErrorState: Story = {
  args: {
    rows: [],
    status: {
      kind: 'error',
      message: 'Attendance could not be loaded. Check your connection and try again.',
      onRetry: noop,
    },
  },
};

export const ManyColumnsOnNarrowWidth: Story = {
  args: { columns: MANY_COLUMNS },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};

export const FirstPage: Story = {
  args: { initialPage: 1, pageCount: 5 },
};

export const MiddlePage: Story = {
  args: { initialPage: 3, pageCount: 5 },
};

export const LastPage: Story = {
  args: { initialPage: 5, pageCount: 5 },
};
