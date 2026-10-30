import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import {
  loginRequestSchema,
  type CurrentAccount,
  type LoginRequest,
  type LoginResponse,
} from '@dexa/contracts';
import { AUTH_SERVICE_CLIENT, type IAuthServiceClient } from './auth-service-client.interface.js';
import { readBearerToken } from './read-bearer-token.js';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';

// Public routes for now. The global token guard (T-AUTH-05) opts login out of the check.
@Controller('auth')
export class AuthController {
  constructor(@Inject(AUTH_SERVICE_CLIENT) private readonly authService: IAuthServiceClient) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(
    @Body(new ZodValidationPipe(loginRequestSchema)) request: LoginRequest,
  ): Promise<LoginResponse> {
    return this.authService.createSession(request);
  }

  @Get('me')
  getCurrentAccount(
    @Headers('authorization') authorization: string | undefined,
  ): Promise<CurrentAccount> {
    return this.authService.findCurrentAccount(readBearerToken(authorization));
  }
}
