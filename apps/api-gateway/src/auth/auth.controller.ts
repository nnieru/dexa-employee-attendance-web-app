import {
  UnauthorizedError,
  CurrentUser,
  Public,
  Roles,
  type AuthenticatedUser,
} from '@dexa/common';
import {
  REFRESH_TOKEN_LIFETIME_SECONDS,
  changePasswordRequestSchema,
  loginRequestSchema,
  ErrorCode,
  Role,
  type ChangePasswordRequest,
  type CreateSessionResponse,
  type CurrentAccount,
  type LoginRequest,
  type LoginResponse,
} from '@dexa/contracts';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AUTH_SERVICE_CLIENT, type IAuthServiceClient } from './auth-service-client.interface.js';
import {
  REFRESH_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_PATH,
  buildRefreshTokenCookieOptions,
} from './refresh-token-cookie.js';
import { readRefreshTokenCookie } from './read-refresh-cookie.js';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';

const MISSING_REFRESH_TOKEN_MESSAGE = 'Sign in to continue.';

// Only login, refresh, and logout are public. The global guards check the token and role of every
// other route. The gateway owns the refresh-token cookie: auth-service answers with the token in the
// internal body, and only this edge turns it into an httpOnly cookie for the browser.
@Controller('auth')
export class AuthController {
  constructor(@Inject(AUTH_SERVICE_CLIENT) private readonly authService: IAuthServiceClient) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) request: LoginRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const session = await this.authService.createSession(request);
    return answerWithRefreshCookie(session, response);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshSession(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const refreshToken = readRefreshTokenCookie(request.headers.cookie);
    if (refreshToken === undefined) {
      throw new UnauthorizedError(ErrorCode.UNAUTHORIZED, MISSING_REFRESH_TOKEN_MESSAGE);
    }
    const session = await this.authService.refreshSession(refreshToken);
    return answerWithRefreshCookie(session, response);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Res({ passthrough: true }) response: Response): void {
    // The refresh token is stateless, so logout only drops the cookie; the token itself expires.
    response.clearCookie(REFRESH_TOKEN_COOKIE_NAME, { path: REFRESH_TOKEN_COOKIE_PATH });
  }

  @Roles(Role.EMPLOYEE, Role.HR)
  @Get('me')
  getCurrentAccount(@CurrentUser() user: AuthenticatedUser): Promise<CurrentAccount> {
    return this.authService.findCurrentAccount(user);
  }

  @Roles(Role.EMPLOYEE, Role.HR)
  @Patch('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(changePasswordRequestSchema)) request: ChangePasswordRequest,
  ): Promise<void> {
    return this.authService.changePassword(user, request);
  }
}

// Moves the refresh token from the internal answer into the cookie and returns the public login
// response, which never carries the refresh token.
function answerWithRefreshCookie(
  session: CreateSessionResponse,
  response: Response,
): LoginResponse {
  response.cookie(
    REFRESH_TOKEN_COOKIE_NAME,
    session.refreshToken,
    buildRefreshTokenCookieOptions(REFRESH_TOKEN_LIFETIME_SECONDS, isHttps(response)),
  );
  return {
    accessToken: session.accessToken,
    tokenType: session.tokenType,
    expiresIn: session.expiresIn,
    account: session.account,
  };
}

// The proxy reports the scheme the browser used. Anything but an explicit https means plain HTTP
// (local development), where the Secure flag would make the browser drop the cookie.
function isHttps(response: Response): boolean {
  return response.req?.headers['x-forwarded-proto'] === 'https';
}
