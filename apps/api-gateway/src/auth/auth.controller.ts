import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Patch,
  Post,
} from '@nestjs/common';
import { Public } from '@dexa/common';
import {
  changePasswordRequestSchema,
  loginRequestSchema,
  Role,
  type ChangePasswordRequest,
  type CurrentAccount,
  type LoginRequest,
  type LoginResponse,
} from '@dexa/contracts';
import { AUTH_SERVICE_CLIENT, type IAuthServiceClient } from './auth-service-client.interface.js';
import { readBearerToken } from './read-bearer-token.js';
import { Roles } from './roles.decorator.js';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';

// Only login is public. The global guards check the token and role of every other route.
@Controller('auth')
export class AuthController {
  constructor(@Inject(AUTH_SERVICE_CLIENT) private readonly authService: IAuthServiceClient) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(
    @Body(new ZodValidationPipe(loginRequestSchema)) request: LoginRequest,
  ): Promise<LoginResponse> {
    return this.authService.createSession(request);
  }

  @Roles(Role.EMPLOYEE, Role.HR)
  @Get('me')
  getCurrentAccount(
    @Headers('authorization') authorization: string | undefined,
  ): Promise<CurrentAccount> {
    return this.authService.findCurrentAccount(readBearerToken(authorization));
  }

  @Roles(Role.EMPLOYEE, Role.HR)
  @Patch('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  changePassword(
    @Headers('authorization') authorization: string | undefined,
    @Body(new ZodValidationPipe(changePasswordRequestSchema)) request: ChangePasswordRequest,
  ): Promise<void> {
    return this.authService.changePassword(readBearerToken(authorization), request);
  }
}
