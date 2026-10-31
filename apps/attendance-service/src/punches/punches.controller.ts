import {
  CurrentUser,
  GatewayUserAuthGuard,
  Roles,
  RolesGuard,
  type AuthenticatedUser,
} from '@dexa/common';
import {
  clockInRequestSchema,
  clockOutRequestSchema,
  Role,
  type ClockInRequest,
  type ClockInResponse,
  type ClockOutRequest,
  type ClockOutResponse,
  type TodayAttendanceResponse,
} from '@dexa/contracts';
import { Body, Controller, Get, Inject, Post, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import { CLOCK_IN_SERVICE, type IClockInService } from './clock-in.service.interface.js';
import { CLOCK_OUT_SERVICE, type IClockOutService } from './clock-out.service.interface.js';
import { TODAY_STATE_SERVICE, type ITodayStateService } from './today-state.service.interface.js';

// The identity comes only from the verified token. The body is validated for its shape only: a strict empty object,
// so a client timestamp, date, or account is refused before the service runs (ATT-3).
@Controller('attendance')
@UseGuards(GatewayUserAuthGuard, RolesGuard)
@Roles(Role.EMPLOYEE, Role.HR)
export class PunchesController {
  constructor(
    @Inject(CLOCK_IN_SERVICE) private readonly clockIns: IClockInService,
    @Inject(CLOCK_OUT_SERVICE) private readonly clockOuts: IClockOutService,
    @Inject(TODAY_STATE_SERVICE) private readonly todayState: ITodayStateService,
  ) {}

  // The body parameter comes first because the pipe runs for its check and its value is not used.
  @Post('clock-in')
  clockIn(
    @Body(new ZodValidationPipe(clockInRequestSchema)) _request: ClockInRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ClockInResponse> {
    return this.clockIns.clockIn(user.accountId);
  }

  @Post('clock-out')
  clockOut(
    @Body(new ZodValidationPipe(clockOutRequestSchema)) _request: ClockOutRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ClockOutResponse> {
    return this.clockOuts.clockOut(user.accountId);
  }

  // A read: no body, and no query parameter changes what is returned. The account is the token's only.
  @Get('me/today')
  today(@CurrentUser() user: AuthenticatedUser): Promise<TodayAttendanceResponse> {
    return this.todayState.getToday(user.accountId);
  }
}
