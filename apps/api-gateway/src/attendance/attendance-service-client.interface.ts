import type { ClockInResponse, ClockOutResponse } from '@dexa/contracts';

/** The gateway's calls into attendance-service. Controllers depend on this port, not on the transport. */
export interface IAttendanceServiceClient {
  clockIn(accessToken: string): Promise<ClockInResponse>;
  clockOut(accessToken: string): Promise<ClockOutResponse>;
}

export const ATTENDANCE_SERVICE_CLIENT = Symbol('IAttendanceServiceClient');
