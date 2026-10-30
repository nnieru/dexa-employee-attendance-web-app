import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, type AuthenticatedUser } from '@dexa/common';
import {
  clockInRequestSchema,
  Role,
  type ClockInRequest,
  type ClockInResponse,
} from '@dexa/contracts';
import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import { CLOCK_IN_SERVICE, type IClockInService } from './clock-in.service.interface.js';

// The identity comes only from the verified token. The body is validated for its shape only: a strict empty object,
// so a client timestamp, date, or account is refused before the service runs (ATT-3).
@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.EMPLOYEE, Role.HR)
export class PunchesController {
  constructor(@Inject(CLOCK_IN_SERVICE) private readonly clockIns: IClockInService) {}

  // The body parameter comes first because the pipe runs for its check and its value is not used.
  @Post('clock-in')
  clockIn(
    @Body(new ZodValidationPipe(clockInRequestSchema)) _request: ClockInRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ClockInResponse> {
    return this.clockIns.clockIn(user.accountId);
  }
}
