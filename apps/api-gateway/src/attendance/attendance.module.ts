import { Module } from '@nestjs/common';
import { ATTENDANCE_SERVICE_CLIENT } from './attendance-service-client.interface.js';
import { AttendanceServiceClient } from './attendance-service.client.js';
import { AttendanceController } from './attendance.controller.js';

@Module({
  controllers: [AttendanceController],
  providers: [{ provide: ATTENDANCE_SERVICE_CLIENT, useClass: AttendanceServiceClient }],
})
export class GatewayAttendanceModule {}
