import { Module } from '@nestjs/common';
import { EMPLOYEE_CLIENT } from './employee-client.interface.js';
import { EmployeeClient } from './employee.client.js';

@Module({
  providers: [{ provide: EMPLOYEE_CLIENT, useClass: EmployeeClient }],
  exports: [EMPLOYEE_CLIENT],
})
export class EmployeesModule {}
