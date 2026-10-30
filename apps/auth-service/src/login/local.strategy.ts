import type { LoginResponse } from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { LOGIN_SERVICE, type ILoginService } from './login-service.interface.js';
import { readLoginRequest } from './read-login-request.js';

export const LOCAL_STRATEGY_NAME = 'local';

/**
 * Verifies the sign-in credentials for LocalAuthGuard. LoginRequestGuard has already checked the body.
 * Reading it again here gives the portal, which passport-local does not pass on.
 */
@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, LOCAL_STRATEGY_NAME) {
  constructor(@Inject(LOGIN_SERVICE) private readonly loginService: ILoginService) {
    super({ usernameField: 'email', passwordField: 'password', passReqToCallback: true });
  }

  validate(request: { readonly body: unknown }): Promise<LoginResponse> {
    return this.loginService.login(readLoginRequest(request.body));
  }
}
