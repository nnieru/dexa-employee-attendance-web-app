import type { ClockInResponse } from '@dexa/contracts';

export const CLOCK_IN_SERVICE = Symbol('IClockInService');

/** Records the signed-in employee's first punch of the business day (ATT-1, ATT-4, ATT-7, ATT-8). */
export interface IClockInService {
  /** The account comes from the verified token. Rejects with a domain error when the punch is refused. */
  clockIn(accountId: string): Promise<ClockInResponse>;
}
