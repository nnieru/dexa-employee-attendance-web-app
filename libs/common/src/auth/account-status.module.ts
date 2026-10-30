import { Module, type DynamicModule } from '@nestjs/common';
import { ACCOUNT_STATUS_READER } from './account-status-reader.interface.js';
import { AuthServiceAccountStatusReader } from './auth-service-account-status.reader.js';

/**
 * Binds ACCOUNT_STATUS_READER for JwtAuthGuard. The guard is used per route in many modules, so the binding is
 * global: a service that never imports one of these modules fails at startup, not at the first request.
 * The importing app must also import InternalHttpModule.forRoot with an auth-service base URL.
 */
@Module({})
export class AccountStatusModule {
  static forRemote(): DynamicModule {
    return {
      module: AccountStatusModule,
      global: true,
      providers: [{ provide: ACCOUNT_STATUS_READER, useClass: AuthServiceAccountStatusReader }],
      exports: [ACCOUNT_STATUS_READER],
    };
  }
}
