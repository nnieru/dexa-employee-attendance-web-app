import type { TodayAttendanceState } from '@dexa/contracts';
import { PUNCH_LABEL } from './attendance-copy.js';
import { formatBusinessTime } from './format-business-time.js';
import {
  getCheckInStatusDisplay,
  getCheckOutStatusDisplay,
  type PunchStatusDisplay,
} from './get-punch-status-display.js';

type PunchRow = {
  label: string;
  /** Null when the punch is not recorded yet. A missing time is never shown as 00:00 (DESIGN §8). */
  recordedTime: string | null;
  statusDisplay: PunchStatusDisplay | null;
};

/** The two punch rows of today, from the server's confirmed state only. */
export function getPunchRows(state: TodayAttendanceState): ReadonlyArray<PunchRow> {
  return [getClockInRow(state), getClockOutRow(state)];
}

function getClockInRow(state: TodayAttendanceState): PunchRow {
  if (state.status === 'NOT_CLOCKED_IN') {
    return { label: PUNCH_LABEL.IN, recordedTime: null, statusDisplay: null };
  }
  return {
    label: PUNCH_LABEL.IN,
    recordedTime: formatBusinessTime(state.clockInAt),
    statusDisplay: getCheckInStatusDisplay(state.clockInStatus),
  };
}

function getClockOutRow(state: TodayAttendanceState): PunchRow {
  if (state.status !== 'DONE') {
    return { label: PUNCH_LABEL.OUT, recordedTime: null, statusDisplay: null };
  }
  return {
    label: PUNCH_LABEL.OUT,
    recordedTime: formatBusinessTime(state.clockOutAt),
    statusDisplay: getCheckOutStatusDisplay(state.clockOutStatus),
  };
}
