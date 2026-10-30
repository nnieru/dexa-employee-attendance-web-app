import { Module } from '@nestjs/common';
import { AUTH_ACCOUNT_CLIENT } from './auth-account-client.interface.js';
import { AuthAccountClient } from './auth-account.client.js';

@Module({
  providers: [{ provide: AUTH_ACCOUNT_CLIENT, useClass: AuthAccountClient }],
  exports: [AUTH_ACCOUNT_CLIENT],
})
export class AuthAccountsModule {}
