import { Link } from '@tanstack/react-router';
import type { AttendanceSummaryItem } from '@dexa/contracts';
import { StatusLabel, createDataTableColumnHelper } from '@dexa/ui';
import { formatBusinessDateTime, isWithinCorrectionWindow } from '../utils/business-date.js';
import type { BusinessDate } from '../types/summary-search.schema.js';
import { formatOvertimeDuration } from '../utils/format-overtime-duration.js';
import {
  getSummaryCheckInStatusDisplay,
  getSummaryCheckOutStatusDisplay,
  getSummaryDayStatusDisplay,
  type SummaryStatusDisplay,
} from '../utils/get-summary-status-display.js';
import {
  CORRECTION_ACTION_HEADER,
  CORRECTION_LINK_TEXT,
  getCorrectionLinkName,
} from '../utils/summary-messages.js';

const helper = createDataTableColumnHelper<AttendanceSummaryItem>();

function renderStatus(display: SummaryStatusDisplay) {
  return <StatusLabel tone={display.tone}>{display.text}</StatusLabel>;
}

// Columns follow the day outcome's ordering: the day outcome, then the check-in and check-out with their
// classifications, then
// the approved overtime. A day with no check-in or no check-out leaves that time cell empty; the status cell says it is
// not recorded yet, or not required on a day off or a leave day.
// The action links to the correction form with the day pre-filled. Only days still inside the correction
// window get the link, so a row the form would refuse does not offer one.
export function createSummaryColumns(today: BusinessDate) {
  return helper.columns([
    helper.display({
      id: 'date',
      header: 'Date',
      cell: ({ row }) => row.original.businessDate,
    }),
    helper.display({
      id: 'dayStatus',
      header: 'Day status',
      cell: ({ row }) => renderStatus(getSummaryDayStatusDisplay(row.original.dayStatus)),
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
    helper.display({
      id: 'approvedOvertime',
      header: 'Approved overtime',
      cell: ({ row }) => formatOvertimeDuration(row.original.approvedOvertimeMinutes),
    }),
    helper.display({
      id: 'action',
      header: CORRECTION_ACTION_HEADER,
      cell: ({ row }) =>
        isWithinCorrectionWindow(row.original.businessDate, today) ? (
          <Link
            to="/requests/corrections/new"
            search={{ date: row.original.businessDate }}
            className="summary-correction-link"
            aria-label={getCorrectionLinkName(row.original.businessDate)}
          >
            {CORRECTION_LINK_TEXT}
          </Link>
        ) : null,
    }),
  ]);
}
