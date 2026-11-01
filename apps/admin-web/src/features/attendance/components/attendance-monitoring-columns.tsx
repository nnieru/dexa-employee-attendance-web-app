import type { AttendanceMonitoringItem } from '@dexa/contracts';
import { StatusLabel, createDataTableColumnHelper } from '@dexa/ui';
import { formatBusinessDateTime } from '../utils/business-date.js';
import {
  getCheckInStatusDisplay,
  getCheckOutStatusDisplay,
  type AttendanceStatusDisplay,
} from '../utils/attendance-status-display.js';
import { NOT_AVAILABLE_TEXT } from '../utils/attendance-monitoring-messages.js';

const helper = createDataTableColumnHelper<AttendanceMonitoringItem>();

function renderStatus(display: AttendanceStatusDisplay) {
  return <StatusLabel tone={display.tone}>{display.text}</StatusLabel>;
}

// Read only: no column renders an action, so a row offers no edit or delete control (ADM-6). A day with no clock in or
// no clock out leaves that time cell empty; its status cell says the timing is not recorded yet, or not required (ADM-4).
export const ATTENDANCE_MONITORING_COLUMNS = helper.columns([
  helper.display({
    id: 'employee',
    header: 'Employee',
    cell: ({ row }) => row.original.employee?.name ?? NOT_AVAILABLE_TEXT,
  }),
  helper.display({
    id: 'date',
    header: 'Date',
    cell: ({ row }) => row.original.businessDate,
  }),
  helper.display({
    id: 'clockIn',
    header: 'Clock in',
    cell: ({ row }) =>
      row.original.clockInAt === null ? null : formatBusinessDateTime(row.original.clockInAt),
  }),
  helper.display({
    id: 'clockInStatus',
    header: 'Clock-in status',
    cell: ({ row }) => renderStatus(getCheckInStatusDisplay(row.original.clockInStatus)),
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
    cell: ({ row }) => renderStatus(getCheckOutStatusDisplay(row.original.clockOutStatus)),
  }),
]);
