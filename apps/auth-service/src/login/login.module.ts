import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { AccountsModule } from '../accounts/accounts.module.js';
import { CredentialsModule } from '../credentials/credentials.module.js';
import { PASSWORD_HASHER, type IPasswordHasher } from '../credentials/password-hasher.interface.js';
import { CurrentAccountController } from './current-account.controller.js';
import { CURRENT_ACCOUNT_SERVICE } from './current-account-service.interface.js';
import { CurrentAccountService } from './current-account.service.js';
import { DUMMY_PASSWORD_HASH } from './dummy-password-hash.token.js';
import { LOGIN_SERVICE } from './login-service.interface.js';
import { LoginService } from './login.service.js';
import { LocalStrategy } from './local.strategy.js';
import { REFRESH_SESSION_SERVICE } from './refresh-session-service.interface.js';
import { RefreshSessionService } from './refresh-session.service.js';
import { SessionsController } from './sessions.controller.js';
import { USER_TOKEN_SIGNER } from './user-token-signer.interface.js';
import { UserTokenSigner } from './user-token.signer.js';
import { USER_TOKEN_VERIFIER } from './user-token-verifier.interface.js';
import { UserTokenVerifier } from './user-token.verifier.js';

@Module({
  imports: [AccountsModule, CredentialsModule, JwtModule.register({})],
  providers: [
    { provide: LOGIN_SERVICE, useClass: LoginService },
    { provide: USER_TOKEN_SIGNER, useClass: UserTokenSigner },
    { provide: USER_TOKEN_VERIFIER, useClass: UserTokenVerifier },
    { provide: REFRESH_SESSION_SERVICE, useClass: RefreshSessionService },
    { provide: CURRENT_ACCOUNT_SERVICE, useClass: CurrentAccountService },
    {
      provide: DUMMY_PASSWORD_HASH,
      inject: [PASSWORD_HASHER],
      // Computed once per start. The random input is discarded, so nothing can be verified against it
      // and the hash exists only to cost the same time as a real one.
      useFactory: (passwordHasher: IPasswordHasher): Promise<string> =>
        passwordHasher.hash(randomUUID()),
    },
    LocalStrategy,
  ],
  controllers: [SessionsController, CurrentAccountController],
})
export class LoginModule {}
