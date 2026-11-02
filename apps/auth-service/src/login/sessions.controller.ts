import { ServiceAuthGuard } from '@dexa/common';
import {
  refreshSessionRequestSchema,
  type CreateSessionResponse,
  type RefreshSessionRequest,
} from '@dexa/contracts';
import { Body, Controller, HttpCode, HttpStatus, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiGatewayCallerGuard } from './api-gateway-caller.guard.js';
import { LocalAuthGuard } from './local-auth.guard.js';
import { LoginRequestGuard } from './login-request.guard.js';
import { LoginSession } from './login-session.decorator.js';
import {
  REFRESH_SESSION_SERVICE,
  type IRefreshSessionService,
} from './refresh-session-service.interface.js';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';

// Only api-gateway calls these routes. The create guards run in the order listed: the service token
// first, then the caller, then the body, and the credentials last. The refresh route needs the
// service token and caller only; its body is the refresh token.
@Controller('internal/sessions')
@UseGuards(ServiceAuthGuard, ApiGatewayCallerGuard)
export class SessionsController {
  constructor(
    @Inject(REFRESH_SESSION_SERVICE) private readonly refreshSessionService: IRefreshSessionService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @UseGuards(LoginRequestGuard, LocalAuthGuard)
  createSession(@LoginSession() session: CreateSessionResponse): CreateSessionResponse {
    return session;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refreshSession(
    @Body(new ZodValidationPipe(refreshSessionRequestSchema)) request: RefreshSessionRequest,
  ): Promise<CreateSessionResponse> {
    return this.refreshSessionService.refreshSession(request.refreshToken);
  }
}
