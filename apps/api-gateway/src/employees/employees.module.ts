import { Module } from '@nestjs/common';
import { EMPLOYEE_SERVICE_CLIENT } from './employee-service-client.interface.js';
import { EmployeeServiceClient } from './employee-service.client.js';
import { MastersController } from './masters.controller.js';

@Module({
  controllers: [MastersController],
  providers: [{ provide: EMPLOYEE_SERVICE_CLIENT, useClass: EmployeeServiceClient }],
})
export class GatewayEmployeesModule {}
