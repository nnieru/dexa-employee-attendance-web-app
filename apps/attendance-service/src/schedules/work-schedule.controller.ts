import { JwtAuthGuard, Roles, RolesGuard } from '@dexa/common';
import {
  Role,
  workScheduleIdSchema,
  workScheduleVersionRequestSchema,
  type WorkScheduleOverview,
  type WorkScheduleVersion,
  type WorkScheduleVersionRequest,
} from '@dexa/contracts';
import { Body, Controller, Get, Inject, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import {
  WORK_SCHEDULE_SERVICE,
  type IWorkScheduleService,
} from './work-schedule.service.interface.js';
import {
  WORK_SCHEDULE_VERSION_SERVICE,
  type IWorkScheduleVersionService,
} from './work-schedule-version.service.interface.js';

// HR only (SCH-7). The grace values are in these responses, so an employee must never reach them.
@Controller('work-schedules')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.HR)
export class WorkScheduleController {
  constructor(
    @Inject(WORK_SCHEDULE_SERVICE) private readonly schedules: IWorkScheduleService,
    @Inject(WORK_SCHEDULE_VERSION_SERVICE)
    private readonly scheduleVersions: IWorkScheduleVersionService,
  ) {}

  @Get()
  getScheduleOverview(): Promise<WorkScheduleOverview> {
    return this.schedules.getScheduleOverview();
  }

  // A create answers 201 (the Nest default for POST) with the stored version.
  @Post()
  createVersion(
    @Body(new ZodValidationPipe(workScheduleVersionRequestSchema))
    request: WorkScheduleVersionRequest,
  ): Promise<WorkScheduleVersion> {
    return this.scheduleVersions.createVersion(request);
  }

  @Put(':id')
  updateVersion(
    @Param('id', new ZodValidationPipe(workScheduleIdSchema)) versionId: string,
    @Body(new ZodValidationPipe(workScheduleVersionRequestSchema))
    request: WorkScheduleVersionRequest,
  ): Promise<WorkScheduleVersion> {
    return this.scheduleVersions.updateVersion(versionId, request);
  }
}
