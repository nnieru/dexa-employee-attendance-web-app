import type {
  AttendanceMonitoringPage,
  AttendanceMonitoringQuery,
  AttendanceSummaryPage,
  AttendanceSummaryQuery,
  ClockInResponse,
  ClockOutResponse,
  TodayAttendanceResponse,
} from '@dexa/contracts';

/** The gateway's calls into attendance-service. Controllers depend on this port, not on the transport. */
export interface IAttendanceServiceClient {
  clockIn(accessToken: string): Promise<ClockInResponse>;
  clockOut(accessToken: string): Promise<ClockOutResponse>;
  getToday(accessToken: string): Promise<TodayAttendanceResponse>;
  listOwnSummary(
    accessToken: string,
    query: AttendanceSummaryQuery,
  ): Promise<AttendanceSummaryPage>;
  listAttendance(
    accessToken: string,
    query: AttendanceMonitoringQuery,
  ): Promise<AttendanceMonitoringPage>;
}

export const ATTENDANCE_SERVICE_CLIENT = Symbol('IAttendanceServiceClient');
