import type { AttendanceMonitoringItem } from '@dexa/contracts';
import { StatusLabel, createDataTableColumnHelper } from '@dexa/ui';
import { formatBusinessDateTime } from '../utils/business-date.js';
import {
  getCheckInStatusDisplay,
  getCheckOutStatusDisplay,
  getDayStatusDisplay,
  type AttendanceStatusDisplay,
} from '../utils/attendance-status-display.js';
import { NOT_AVAILABLE_TEXT } from '../utils/attendance-monitoring-messages.js';

const helper = createDataTableColumnHelper<AttendanceMonitoringItem>();
const MINUTES_FORMATTER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

function renderStatus(display: AttendanceStatusDisplay) {
  return <StatusLabel tone={display.tone}>{display.text}</StatusLabel>;
}

/** Approved overtime in minutes, keeping the seconds the server stores (OT-4). */
function formatApprovedOvertime(minutes: number): string {
  return `${MINUTES_FORMATTER.format(minutes)} min`;
}

/**
 * The effective time with the original punch beneath it when a correction has been applied (PRD ADM-4, ADM-6). The
 * "Original" word carries the distinction, so it does not depend on colour.
 */
function renderTimeWithOriginal(
  effectiveAt: string | null,
  rawAt: string | null,
  isCorrected: boolean,
) {
  if (effectiveAt === null) return null;
  return (
    <>
      <span>{formatBusinessDateTime(effectiveAt)}</span>
      {isCorrected && (
        <span className="attendance-original-time">
          Original: {rawAt === null ? 'not recorded' : formatBusinessDateTime(rawAt)}
        </span>
      )}
    </>
  );
}

// Read only: no column renders an action, so a row offers no edit or delete control (ADM-6). A day with no clock in or
// no clock out leaves that time cell empty; its status cell says the timing is not recorded yet, or not required (ADM-4).
// A corrected day shows the effective times with the original punch beneath them (T-REQ-21).
export const ATTENDANCE_MONITORING_COLUMNS = helper.columns([
  helper.display({
    id: 'employee',
    header: 'Employee',
    cell: ({ row }) => (
      <>
        <span>{row.original.employee?.name ?? NOT_AVAILABLE_TEXT}</span>
        {row.original.isCorrected && (
          <span className="attendance-corrected-label">
            <StatusLabel tone="info">Corrected</StatusLabel>
          </span>
        )}
      </>
    ),
  }),
  helper.display({
    id: 'date',
    header: 'Date',
    cell: ({ row }) => row.original.businessDate,
  }),
  helper.display({
    id: 'dayStatus',
    header: 'Day status',
    cell: ({ row }) => renderStatus(getDayStatusDisplay(row.original.dayStatus)),
  }),
  helper.display({
    id: 'clockIn',
    header: 'Clock in',
    cell: ({ row }) =>
      renderTimeWithOriginal(
        row.original.clockInAt,
        row.original.rawClockInAt,
        row.original.isCorrected,
      ),
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
      renderTimeWithOriginal(
        row.original.clockOutAt,
        row.original.rawClockOutAt,
        row.original.isCorrected,
      ),
  }),
  helper.display({
    id: 'clockOutStatus',
    header: 'Clock-out status',
    cell: ({ row }) => renderStatus(getCheckOutStatusDisplay(row.original.clockOutStatus)),
  }),
  helper.display({
    id: 'approvedOvertime',
    header: 'Approved overtime',
    cell: ({ row }) => formatApprovedOvertime(row.original.approvedOvertimeMinutes),
  }),
]);
