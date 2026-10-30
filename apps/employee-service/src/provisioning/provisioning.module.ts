import { Module } from '@nestjs/common';
import { AuthAccountsModule } from '../auth-accounts/auth-accounts.module.js';
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
  ],
})
export class ProvisioningModule {}
