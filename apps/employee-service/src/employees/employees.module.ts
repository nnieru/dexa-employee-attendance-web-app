import { Module } from '@nestjs/common';
import { EmployeeLookupController } from './employee-lookup.controller.js';
import { EMPLOYEE_LOOKUP_READER } from './employee-lookup-reader.interface.js';
import { EmployeeLookupRepository } from './employee-lookup.repository.js';
import { EMPLOYEE_LOOKUP_SERVICE } from './employee-lookup-service.interface.js';
import { EmployeeLookupService } from './employee-lookup.service.js';

@Module({
  controllers: [EmployeeLookupController],
  providers: [
    { provide: EMPLOYEE_LOOKUP_READER, useClass: EmployeeLookupRepository },
    { provide: EMPLOYEE_LOOKUP_SERVICE, useClass: EmployeeLookupService },
  ],
})
export class EmployeesModule {}
