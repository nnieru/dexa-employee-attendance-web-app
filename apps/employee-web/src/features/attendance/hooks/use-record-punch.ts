import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ClockInResponse, ClockOutResponse } from '@dexa/contracts';
import { useSession, type ApiClient } from '@dexa/session';
import { attendanceQueryKeys } from '../api/attendance-query-keys.js';
import { clockIn } from '../api/clock-in.js';
import { clockOut } from '../api/clock-out.js';
import type { PunchType } from '../utils/get-punch-action.js';

type PunchResponse = ClockInResponse | ClockOutResponse;
type RecordPunch = (apiClient: ApiClient) => Promise<PunchResponse>;

const RECORD_PUNCH_BY_TYPE: Readonly<Record<PunchType, RecordPunch>> = {
  IN: clockIn,
  OUT: clockOut,
};

/**
 * Records one punch. A punch is never retried automatically: a retry could repeat a write or hit a 409. Whatever
 * the outcome, today's state is read again before the mutation settles, so the action stays disabled until the
 * server's state is shown.
 */
export function useRecordPunch() {
  const { apiClient } = useSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (punchType: PunchType) => RECORD_PUNCH_BY_TYPE[punchType](apiClient),
    retry: false,
    onSettled: () => queryClient.invalidateQueries({ queryKey: attendanceQueryKeys.today() }),
  });
}
