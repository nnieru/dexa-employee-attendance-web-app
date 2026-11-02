import type { ClockOutResponse } from '@dexa/contracts';

export const CLOCK_OUT_SERVICE = Symbol('IClockOutService');

/** Records the signed-in employee's check-out for the business day. */
export interface IClockOutService {
  /** The account comes from the verified token. Rejects with a domain error when the punch is refused. */
  clockOut(accountId: string): Promise<ClockOutResponse>;
}
