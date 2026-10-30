import { Module } from '@nestjs/common';
import { AuthAccountsModule } from '../auth-accounts/auth-accounts.module.js';
import { EMPLOYEE_DETAIL_READER } from '../employees/employee-detail.reader.interface.js';
import { EmployeeDetailRepository } from '../employees/employee-detail.repository.js';
import { MASTER_ASSIGNMENT_READER } from '../masters/master-assignment.reader.interface.js';
import { MasterAssignmentRepository } from '../masters/master-assignment.repository.js';
import { AUTH_PROVISIONING_CLIENT } from './auth-provisioning-client.interface.js';
import { AuthProvisioningClient } from './auth-provisioning.client.js';
import { EMPLOYEE_PROVISIONING_REPOSITORY } from './employee-provisioning.repository.interface.js';
import { EmployeeProvisioningRepository } from './employee-provisioning.repository.js';
import { EmployeeProvisioningController } from './employee-provisioning.controller.js';
import { EMPLOYEE_PROVISIONING_SERVICE } from './employee-provisioning.service.interface.js';
import { EmployeeProvisioningService } from './employee-provisioning.service.js';

@Module({
  imports: [AuthAccountsModule],
  controllers: [EmployeeProvisioningController],
  providers: [
    { provide: EMPLOYEE_PROVISIONING_SERVICE, useClass: EmployeeProvisioningService },
    { provide: EMPLOYEE_PROVISIONING_REPOSITORY, useClass: EmployeeProvisioningRepository },
    { provide: AUTH_PROVISIONING_CLIENT, useClass: AuthProvisioningClient },
    { provide: MASTER_ASSIGNMENT_READER, useClass: MasterAssignmentRepository },
    { provide: EMPLOYEE_DETAIL_READER, useClass: EmployeeDetailRepository },
  ],
})
export class ProvisioningModule {}
