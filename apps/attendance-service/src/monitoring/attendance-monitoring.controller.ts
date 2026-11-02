import { GatewayUserAuthGuard, Roles, RolesGuard } from '@dexa/common';
import {
  attendanceMonitoringQuerySchema,
  Role,
  type AttendanceMonitoringPage,
  type AttendanceMonitoringQuery,
} from '@dexa/contracts';
import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import {
  ATTENDANCE_MONITORING_SERVICE,
  type IAttendanceMonitoringService,
} from './attendance-monitoring.service.interface.js';

// HR only, checked here as well as at the gateway. The controller has only this GET: attendance records have no
// PUT, PATCH, or DELETE route.
@Controller('attendance')
@UseGuards(GatewayUserAuthGuard, RolesGuard)
@Roles(Role.HR)
export class AttendanceMonitoringController {
  constructor(
    @Inject(ATTENDANCE_MONITORING_SERVICE)
    private readonly monitoring: IAttendanceMonitoringService,
  ) {}

  @Get()
  listAttendance(
    @Query(new ZodValidationPipe(attendanceMonitoringQuerySchema)) query: AttendanceMonitoringQuery,
  ): Promise<AttendanceMonitoringPage> {
    return this.monitoring.listAttendance(query);
  }
}
