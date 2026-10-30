import { Module } from '@nestjs/common';
import { CredentialsModule } from '../credentials/credentials.module.js';
import { DatabaseModule } from '../infrastructure/db/database.module.js';
import { AccountAdministrationController } from './account-administration.controller.js';
import { AccountAdministrationRepository } from './account-administration.repository.js';
import { ACCOUNT_ADMINISTRATION_REPOSITORY } from './account-administration.repository.interface.js';
import { AccountAdministrationService } from './account-administration.service.js';
import { ACCOUNT_ADMINISTRATION_SERVICE } from './account-administration.service.interface.js';
import { AccountLookupController } from './account-lookup.controller.js';
import { ACCOUNT_LOOKUP_READER } from './account-lookup-reader.interface.js';
import { AccountLookupRepository } from './account-lookup.repository.js';
import { ACCOUNT_LOOKUP_SERVICE } from './account-lookup-service.interface.js';
import { AccountLookupService } from './account-lookup.service.js';
import { AccountRepository } from './account.repository.js';
import { ACCOUNT_REPOSITORY } from './account.repository.interface.js';
import { HrBootstrapService } from './hr-bootstrap.service.js';

@Module({
  imports: [CredentialsModule, DatabaseModule],
  providers: [
    { provide: ACCOUNT_REPOSITORY, useClass: AccountRepository },
    { provide: ACCOUNT_LOOKUP_READER, useClass: AccountLookupRepository },
    { provide: ACCOUNT_LOOKUP_SERVICE, useClass: AccountLookupService },
    { provide: ACCOUNT_ADMINISTRATION_SERVICE, useClass: AccountAdministrationService },
    { provide: ACCOUNT_ADMINISTRATION_REPOSITORY, useClass: AccountAdministrationRepository },
    HrBootstrapService,
  ],
  controllers: [AccountLookupController, AccountAdministrationController],
  exports: [ACCOUNT_REPOSITORY, ACCOUNT_LOOKUP_READER],
})
export class AccountsModule {}
