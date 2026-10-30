import { Module } from '@nestjs/common';
import { AuthAccountsModule } from '../auth-accounts/auth-accounts.module.js';
import { EmployeeListController } from './employee-list.controller.js';
import { EMPLOYEE_LIST_READER } from './employee-list-reader.interface.js';
import { EmployeeListRepository } from './employee-list.repository.js';
import { EMPLOYEE_LIST_SERVICE } from './employee-list-service.interface.js';
import { EmployeeListService } from './employee-list.service.js';
import { EmployeeLookupController } from './employee-lookup.controller.js';
import { EMPLOYEE_LOOKUP_READER } from './employee-lookup-reader.interface.js';
import { EmployeeLookupRepository } from './employee-lookup.repository.js';
import { EMPLOYEE_LOOKUP_SERVICE } from './employee-lookup-service.interface.js';
import { EmployeeLookupService } from './employee-lookup.service.js';

@Module({
  imports: [AuthAccountsModule],
  controllers: [EmployeeLookupController, EmployeeListController],
  providers: [
    { provide: EMPLOYEE_LOOKUP_READER, useClass: EmployeeLookupRepository },
    { provide: EMPLOYEE_LOOKUP_SERVICE, useClass: EmployeeLookupService },
    { provide: EMPLOYEE_LIST_READER, useClass: EmployeeListRepository },
    { provide: EMPLOYEE_LIST_SERVICE, useClass: EmployeeListService },
  ],
})
export class EmployeesModule {}
