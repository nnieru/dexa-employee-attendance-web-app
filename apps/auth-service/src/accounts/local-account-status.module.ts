import { ACCOUNT_STATUS_READER } from '@dexa/common';
import { Global, Module } from '@nestjs/common';
import { AccountsModule } from './accounts.module.js';
import { LocalAccountStatusReader } from './local-account-status.reader.js';

// Global so that JwtAuthGuard resolves the reader in every module that serves a user-token route.
@Global()
@Module({
  imports: [AccountsModule],
  providers: [{ provide: ACCOUNT_STATUS_READER, useClass: LocalAccountStatusReader }],
  exports: [ACCOUNT_STATUS_READER],
})
export class LocalAccountStatusModule {}
