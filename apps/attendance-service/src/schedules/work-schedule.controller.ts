import { JwtAuthGuard, Roles, RolesGuard } from '@dexa/common';
import { Role, type WorkScheduleOverview } from '@dexa/contracts';
import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import {
  WORK_SCHEDULE_SERVICE,
  type IWorkScheduleService,
} from './work-schedule.service.interface.js';

// HR only (SCH-7). The grace values are in this response, so an employee must never reach it.
@Controller('work-schedules')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.HR)
export class WorkScheduleController {
  constructor(@Inject(WORK_SCHEDULE_SERVICE) private readonly schedules: IWorkScheduleService) {}

  @Get()
  getScheduleOverview(): Promise<WorkScheduleOverview> {
    return this.schedules.getScheduleOverview();
  }
}
