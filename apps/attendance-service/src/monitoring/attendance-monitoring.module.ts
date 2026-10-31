import { Module } from '@nestjs/common';
import { EmployeesModule } from '../employees/employees.module.js';
import { AttendanceMonitoringController } from './attendance-monitoring.controller.js';
import { ATTENDANCE_MONITORING_READER } from './attendance-monitoring.repository.interface.js';
import { AttendanceMonitoringRepository } from './attendance-monitoring.repository.js';
import { ATTENDANCE_MONITORING_SERVICE } from './attendance-monitoring.service.interface.js';
import { AttendanceMonitoringService } from './attendance-monitoring.service.js';

@Module({
  imports: [EmployeesModule],
  controllers: [AttendanceMonitoringController],
  providers: [
    { provide: ATTENDANCE_MONITORING_SERVICE, useClass: AttendanceMonitoringService },
    { provide: ATTENDANCE_MONITORING_READER, useClass: AttendanceMonitoringRepository },
  ],
})
export class AttendanceMonitoringModule {}
