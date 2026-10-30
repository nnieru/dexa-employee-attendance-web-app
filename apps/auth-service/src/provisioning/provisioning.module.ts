import { Module } from '@nestjs/common';
import { CredentialsModule } from '../credentials/credentials.module.js';
import { DatabaseModule } from '../infrastructure/db/database.module.js';
import { AccountProvisioningController } from './account-provisioning.controller.js';
import { AccountProvisioningRepository } from './account-provisioning.repository.js';
import { ACCOUNT_PROVISIONING_REPOSITORY } from './account-provisioning.repository.interface.js';
import { AccountProvisioningService } from './account-provisioning.service.js';
import { ACCOUNT_PROVISIONING_SERVICE } from './account-provisioning-service.interface.js';

@Module({
  imports: [CredentialsModule, DatabaseModule],
  providers: [
    { provide: ACCOUNT_PROVISIONING_SERVICE, useClass: AccountProvisioningService },
    { provide: ACCOUNT_PROVISIONING_REPOSITORY, useClass: AccountProvisioningRepository },
  ],
  controllers: [AccountProvisioningController],
})
export class ProvisioningModule {}
