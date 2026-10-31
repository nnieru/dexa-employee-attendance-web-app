import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, type AuthenticatedUser } from '@dexa/common';
import {
  attendanceSummaryQuerySchema,
  Role,
  type AttendanceSummaryPage,
  type AttendanceSummaryQuery,
} from '@dexa/contracts';
import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import {
  ATTENDANCE_SUMMARY_SERVICE,
  type IAttendanceSummaryService,
} from './attendance-summary.service.interface.js';

// The identity comes only from the verified token. The query is validated for its shape and range here, and the
// defaults are filled by the service with the clock.
@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.EMPLOYEE, Role.HR)
export class AttendanceSummaryController {
  constructor(
    @Inject(ATTENDANCE_SUMMARY_SERVICE) private readonly summaries: IAttendanceSummaryService,
  ) {}

  @Get('me')
  listOwnSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(attendanceSummaryQuerySchema)) query: AttendanceSummaryQuery,
  ): Promise<AttendanceSummaryPage> {
    return this.summaries.listOwnSummary(user.accountId, query);
  }
}
