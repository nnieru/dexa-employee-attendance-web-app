import type { TodayAttendanceResponse } from '@dexa/contracts';
import { Alert, Button } from '@dexa/ui';
import { useRecordPunch } from '../hooks/use-record-punch.js';
import { PUNCH_LABEL, TODAY_SECTION_LABEL } from '../utils/attendance-copy.js';
import { formatBusinessDate } from '../utils/format-business-time.js';
import { getAttendanceErrorMessage } from '../utils/get-attendance-error-message.js';
import { getPunchAction } from '../utils/get-punch-action.js';
import { getPunchSuccessMessage } from '../utils/get-punch-success-message.js';
import { PunchDetails } from './punch-details.js';

type AttendanceTodayPanelProps = {
  today: TodayAttendanceResponse;
};

// The one primary action is clock in or clock out for the state the server reported. It is disabled when the day
// is done and while a punch is sent or its state is being read again (the mutation stays pending until then).
export function AttendanceTodayPanel({ today }: AttendanceTodayPanelProps) {
  const recordPunchMutation = useRecordPunch();
  const punchAction = getPunchAction(today.state);
  const { data: recordedPunch, error, isPending, isSuccess } = recordPunchMutation;

  return (
    <section className="employee-attendance-panel" aria-label={TODAY_SECTION_LABEL}>
      <p className="employee-attendance-panel__date">{formatBusinessDate(today.businessDate)}</p>
      <PunchDetails today={today} />
      {error !== null && <Alert variant="error">{getAttendanceErrorMessage(error)}</Alert>}
      {isSuccess && recordedPunch !== undefined && (
        <Alert variant="success">{getPunchSuccessMessage(recordedPunch)}</Alert>
      )}
      <Button
        isLoading={isPending}
        disabled={!punchAction.isAvailable}
        onClick={() => recordPunchMutation.mutate(punchAction.punchType)}
      >
        {PUNCH_LABEL[punchAction.punchType]}
      </Button>
    </section>
  );
}
