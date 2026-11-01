import type { TodayAttendanceState } from '@dexa/contracts';

export type PunchType = 'IN' | 'OUT';

type PunchAction = {
  punchType: PunchType;
  /** False when the day is done: the action is shown but cannot be sent (PRD ATT-6). */
  isAvailable: boolean;
};

// Clock in is offered until the first punch; clock out after it. Once the day is done, nothing can be punched, so
// the last action is shown disabled rather than hidden, which keeps one primary action in place.
export function getPunchAction(state: TodayAttendanceState): PunchAction {
  switch (state.status) {
    case 'NOT_CLOCKED_IN':
      return { punchType: 'IN', isAvailable: true };
    case 'CLOCKED_IN':
      return { punchType: 'OUT', isAvailable: true };
    case 'DONE':
      return { punchType: 'OUT', isAvailable: false };
  }
}
