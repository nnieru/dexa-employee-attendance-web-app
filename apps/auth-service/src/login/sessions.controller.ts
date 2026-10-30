import { ServiceAuthGuard } from '@dexa/common';
import type { LoginResponse } from '@dexa/contracts';
import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiGatewayCallerGuard } from './api-gateway-caller.guard.js';
import { LocalAuthGuard } from './local-auth.guard.js';
import { LoginRequestGuard } from './login-request.guard.js';
import { LoginSession } from './login-session.decorator.js';

// Only api-gateway calls this route. The guards run in the order listed: the service token first, then
// the caller, then the body, and the credentials last.
@Controller('internal/sessions')
export class SessionsController {
  @Post()
  @HttpCode(HttpStatus.OK)
  @UseGuards(ServiceAuthGuard, ApiGatewayCallerGuard, LoginRequestGuard, LocalAuthGuard)
  createSession(@LoginSession() session: LoginResponse): LoginResponse {
    return session;
  }
}
