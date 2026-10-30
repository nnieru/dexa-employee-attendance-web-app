import { Roles } from '@dexa/common';
import {
  clockInRequestSchema,
  clockOutRequestSchema,
  Role,
  type ClockInRequest,
  type ClockInResponse,
  type ClockOutRequest,
  type ClockOutResponse,
} from '@dexa/contracts';
import { Body, Controller, Headers, Inject, Post } from '@nestjs/common';
import { readBearerToken } from '../auth/read-bearer-token.js';
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
    @Headers('authorization') authorization: string | undefined,
  ): Promise<ClockInResponse> {
    return this.attendanceService.clockIn(readBearerToken(authorization));
  }

  @Roles(Role.EMPLOYEE, Role.HR)
  @Post('clock-out')
  clockOut(
    @Body(new ZodValidationPipe(clockOutRequestSchema)) _request: ClockOutRequest,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<ClockOutResponse> {
    return this.attendanceService.clockOut(readBearerToken(authorization));
  }
}
