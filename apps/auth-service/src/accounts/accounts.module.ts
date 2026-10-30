import { Module } from '@nestjs/common';
import { CredentialsModule } from '../credentials/credentials.module.js';
import { DatabaseModule } from '../infrastructure/db/database.module.js';
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
    HrBootstrapService,
  ],
  controllers: [AccountLookupController],
  exports: [ACCOUNT_REPOSITORY],
})
export class AccountsModule {}
