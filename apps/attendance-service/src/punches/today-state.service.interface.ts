import type { TodayAttendanceResponse } from '@dexa/contracts';

export const TODAY_STATE_SERVICE = Symbol('ITodayStateService');

/** Answers what the signed-in employee's day looks like now. Read only. */
export interface ITodayStateService {
  /** The account comes from the verified token. Rejects with a domain error when no schedule covers today. */
  getToday(accountId: string): Promise<TodayAttendanceResponse>;
}
