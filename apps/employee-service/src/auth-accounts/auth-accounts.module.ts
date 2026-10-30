import { Module } from '@nestjs/common';
import { AUTH_ACCOUNT_ADMINISTRATION_CLIENT } from './auth-account-administration-client.interface.js';
import { AuthAccountAdministrationClient } from './auth-account-administration.client.js';
import { AUTH_ACCOUNT_CLIENT } from './auth-account-client.interface.js';
import { AuthAccountClient } from './auth-account.client.js';

@Module({
  providers: [
    { provide: AUTH_ACCOUNT_CLIENT, useClass: AuthAccountClient },
    { provide: AUTH_ACCOUNT_ADMINISTRATION_CLIENT, useClass: AuthAccountAdministrationClient },
  ],
  exports: [AUTH_ACCOUNT_CLIENT, AUTH_ACCOUNT_ADMINISTRATION_CLIENT],
})
export class AuthAccountsModule {}
