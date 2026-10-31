import { CurrentUser, Roles, type AuthenticatedUser } from '@dexa/common';
import {
  Role,
  workScheduleIdSchema,
  workScheduleVersionRequestSchema,
  type WorkScheduleOverview,
  type WorkScheduleVersion,
  type WorkScheduleVersionRequest,
} from '@dexa/contracts';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import {
  WORK_SCHEDULE_CLIENT,
  type IWorkScheduleClient,
} from './work-schedule-client.interface.js';

// HR only (SCH-7). Employees never see the grace values, so the gateway refuses them before the call.
@Controller('work-schedules')
export class WorkScheduleController {
  constructor(@Inject(WORK_SCHEDULE_CLIENT) private readonly schedules: IWorkScheduleClient) {}

  @Roles(Role.HR)
  @Get()
  getScheduleOverview(@CurrentUser() user: AuthenticatedUser): Promise<WorkScheduleOverview> {
    return this.schedules.getScheduleOverview(user);
  }

  // The body is strict, so a client cannot send effectiveUntil, a timezone, or a name. attendance-service validates it
  // again. A create answers 201 with the stored version.
  @Roles(Role.HR)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  createVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(workScheduleVersionRequestSchema))
    request: WorkScheduleVersionRequest,
  ): Promise<WorkScheduleVersion> {
    return this.schedules.createVersion(user, request);
  }

  @Roles(Role.HR)
  @Put(':id')
  updateVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(workScheduleIdSchema)) versionId: string,
    @Body(new ZodValidationPipe(workScheduleVersionRequestSchema))
    request: WorkScheduleVersionRequest,
  ): Promise<WorkScheduleVersion> {
    return this.schedules.updateVersion(user, versionId, request);
  }
}
