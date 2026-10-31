import { CurrentUser, Roles, type AuthenticatedUser } from '@dexa/common';
import {
  attendanceMonitoringQuerySchema,
  attendanceSummaryQuerySchema,
  clockInRequestSchema,
  clockOutRequestSchema,
  Role,
  type AttendanceMonitoringPage,
  type AttendanceMonitoringQuery,
  type AttendanceSummaryPage,
  type AttendanceSummaryQuery,
  type ClockInRequest,
  type ClockInResponse,
  type ClockOutRequest,
  type ClockOutResponse,
  type TodayAttendanceResponse,
} from '@dexa/contracts';
import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common';
import {
  ATTENDANCE_SERVICE_CLIENT,
  type IAttendanceServiceClient,
} from './attendance-service-client.interface.js';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';

// The body is strict here and again in attendance-service, so a client timestamp is refused at the edge (ATT-3).
// The body parameter comes first because the pipe runs for its check and its value is not used.
@Controller('attendance')
export class AttendanceController {
  constructor(
    @Inject(ATTENDANCE_SERVICE_CLIENT) private readonly attendanceService: IAttendanceServiceClient,
  ) {}

  @Roles(Role.EMPLOYEE, Role.HR)
  @Post('clock-in')
  clockIn(
    @Body(new ZodValidationPipe(clockInRequestSchema)) _request: ClockInRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ClockInResponse> {
    return this.attendanceService.clockIn(user);
  }

  @Roles(Role.EMPLOYEE, Role.HR)
  @Post('clock-out')
  clockOut(
    @Body(new ZodValidationPipe(clockOutRequestSchema)) _request: ClockOutRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ClockOutResponse> {
    return this.attendanceService.clockOut(user);
  }

  @Roles(Role.EMPLOYEE, Role.HR)
  @Get('me/today')
  today(@CurrentUser() user: AuthenticatedUser): Promise<TodayAttendanceResponse> {
    return this.attendanceService.getToday(user);
  }

  // The range and page are validated here and again by attendance-service. The defaults are filled there, from its clock.
  @Roles(Role.EMPLOYEE, Role.HR)
  @Get('me')
  listOwnSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(attendanceSummaryQuerySchema)) query: AttendanceSummaryQuery,
  ): Promise<AttendanceSummaryPage> {
    return this.attendanceService.listOwnSummary(user, query);
  }

  // HR monitoring of every account's days (ADM-4). The query is strict here and again in attendance-service. The
  // service has no write route for these records, so only this GET exists (ADM-6).
  @Roles(Role.HR)
  @Get()
  listAttendance(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(attendanceMonitoringQuerySchema)) query: AttendanceMonitoringQuery,
  ): Promise<AttendanceMonitoringPage> {
    return this.attendanceService.listAttendance(user, query);
  }
}
