import { Roles } from '@dexa/common';
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
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { readBearerToken } from '../auth/read-bearer-token.js';
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
  getScheduleOverview(
    @Headers('authorization') authorization: string | undefined,
  ): Promise<WorkScheduleOverview> {
    return this.schedules.getScheduleOverview(readBearerToken(authorization));
  }

  // The body is strict, so a client cannot send effectiveUntil, a timezone, or a name. attendance-service validates it
  // again. A create answers 201 with the stored version.
  @Roles(Role.HR)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  createVersion(
    @Headers('authorization') authorization: string | undefined,
    @Body(new ZodValidationPipe(workScheduleVersionRequestSchema))
    request: WorkScheduleVersionRequest,
  ): Promise<WorkScheduleVersion> {
    return this.schedules.createVersion(readBearerToken(authorization), request);
  }

  @Roles(Role.HR)
  @Put(':id')
  updateVersion(
    @Headers('authorization') authorization: string | undefined,
    @Param('id', new ZodValidationPipe(workScheduleIdSchema)) versionId: string,
    @Body(new ZodValidationPipe(workScheduleVersionRequestSchema))
    request: WorkScheduleVersionRequest,
  ): Promise<WorkScheduleVersion> {
    return this.schedules.updateVersion(readBearerToken(authorization), versionId, request);
  }
}
