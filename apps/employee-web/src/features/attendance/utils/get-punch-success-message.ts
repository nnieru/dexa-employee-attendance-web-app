import type { ClockInResponse, ClockOutResponse } from '@dexa/contracts';
import { CLOCKED_IN_MESSAGE_PREFIX, CLOCKED_OUT_MESSAGE_PREFIX } from './attendance-copy.js';
import { formatBusinessTime } from './format-business-time.js';

/** The confirmation after a punch, using the server's recordedAt only. */
export function getPunchSuccessMessage(punch: ClockInResponse | ClockOutResponse): string {
  const prefix = punch.type === 'IN' ? CLOCKED_IN_MESSAGE_PREFIX : CLOCKED_OUT_MESSAGE_PREFIX;
  return `${prefix} ${formatBusinessTime(punch.recordedAt)}.`;
}
