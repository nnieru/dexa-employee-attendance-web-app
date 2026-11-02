import type { TodayAttendanceResponse } from '@dexa/contracts';
import { StatusLabel } from '@dexa/ui';
import { NOT_RECORDED_YET_TEXT, SCHEDULED_HOURS_LABEL } from '../utils/attendance-copy.js';
import { formatScheduledHours } from '../utils/format-business-time.js';
import { getPunchRows } from '../utils/get-punch-rows.js';

type PunchDetailsProps = {
  today: TodayAttendanceResponse;
};

// Each confirmed punch shows its server time and its own classification label. The check-in and the
// check-out are separate rows, so the same word is never read as the other punch's timing.
export function PunchDetails({ today }: PunchDetailsProps) {
  const punchRows = getPunchRows(today.state);
  return (
    <dl className="employee-attendance-details">
      <div className="employee-attendance-details__row">
        <dt>{SCHEDULED_HOURS_LABEL}</dt>
        <dd>{formatScheduledHours(today)}</dd>
      </div>
      {punchRows.map((row) => (
        <div key={row.label} className="employee-attendance-details__row">
          <dt>{row.label}</dt>
          <dd>
            <span>{row.recordedTime ?? NOT_RECORDED_YET_TEXT}</span>
            {row.statusDisplay !== null && (
              <StatusLabel tone={row.statusDisplay.tone}>{row.statusDisplay.text}</StatusLabel>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
