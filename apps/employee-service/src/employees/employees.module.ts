import { Module } from '@nestjs/common';
import { AuthAccountsModule } from '../auth-accounts/auth-accounts.module.js';
import { MASTER_ASSIGNMENT_READER } from '../masters/master-assignment.reader.interface.js';
import { MasterAssignmentRepository } from '../masters/master-assignment.repository.js';
import { ProfileModule } from '../profile/profile.module.js';
import { EmployeeDetailRepository } from './employee-detail.repository.js';
import { EMPLOYEE_DETAIL_READER } from './employee-detail.reader.interface.js';
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
import { EmployeeUpdateController } from './employee-update.controller.js';
import { EmployeeUpdateService } from './employee-update.service.js';
import { EMPLOYEE_UPDATE_SERVICE } from './employee-update.service.interface.js';

// ProfileModule is imported for the profile writer that the update saves through. Its self-service routes must be
// registered before EmployeeUpdateController's `:accountId` route, which AppModule arranges.
@Module({
  imports: [AuthAccountsModule, ProfileModule],
  controllers: [EmployeeLookupController, EmployeeListController, EmployeeUpdateController],
  providers: [
    { provide: EMPLOYEE_LOOKUP_READER, useClass: EmployeeLookupRepository },
    { provide: EMPLOYEE_LOOKUP_SERVICE, useClass: EmployeeLookupService },
    { provide: EMPLOYEE_LIST_READER, useClass: EmployeeListRepository },
    { provide: EMPLOYEE_LIST_SERVICE, useClass: EmployeeListService },
    { provide: EMPLOYEE_DETAIL_READER, useClass: EmployeeDetailRepository },
    { provide: MASTER_ASSIGNMENT_READER, useClass: MasterAssignmentRepository },
    { provide: EMPLOYEE_UPDATE_SERVICE, useClass: EmployeeUpdateService },
  ],
})
export class EmployeesModule {}
