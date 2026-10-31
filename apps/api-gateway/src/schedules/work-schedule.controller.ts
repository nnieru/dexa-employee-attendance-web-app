import { Roles } from '@dexa/common';
import { Role, type WorkScheduleOverview } from '@dexa/contracts';
import { Controller, Get, Headers, Inject } from '@nestjs/common';
import { readBearerToken } from '../auth/read-bearer-token.js';
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
}
