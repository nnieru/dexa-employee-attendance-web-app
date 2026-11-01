import type { AttendanceSummaryItem } from '@dexa/contracts';
import { StatusLabel, createDataTableColumnHelper } from '@dexa/ui';
import { formatBusinessDateTime } from '../utils/business-date.js';
import {
  getSummaryCheckInStatusDisplay,
  getSummaryCheckOutStatusDisplay,
  type SummaryStatusDisplay,
} from '../utils/get-summary-status-display.js';

const helper = createDataTableColumnHelper<AttendanceSummaryItem>();

function renderStatus(display: SummaryStatusDisplay) {
  return <StatusLabel tone={display.tone}>{display.text}</StatusLabel>;
}

// A day with no check-out leaves the Clock out cell empty; the status cell says it is not recorded yet (SUM-4).
export const SUMMARY_COLUMNS = helper.columns([
  helper.display({
    id: 'date',
    header: 'Date',
    cell: ({ row }) => row.original.businessDate,
  }),
  helper.display({
    id: 'clockIn',
    header: 'Clock in',
    cell: ({ row }) => formatBusinessDateTime(row.original.clockInAt),
  }),
  helper.display({
    id: 'clockInStatus',
    header: 'Clock-in status',
    cell: ({ row }) => renderStatus(getSummaryCheckInStatusDisplay(row.original.clockInStatus)),
  }),
  helper.display({
    id: 'clockOut',
    header: 'Clock out',
    cell: ({ row }) =>
      row.original.clockOutAt === null ? null : formatBusinessDateTime(row.original.clockOutAt),
  }),
  helper.display({
    id: 'clockOutStatus',
    header: 'Clock-out status',
    cell: ({ row }) => renderStatus(getSummaryCheckOutStatusDisplay(row.original.clockOutStatus)),
  }),
]);
