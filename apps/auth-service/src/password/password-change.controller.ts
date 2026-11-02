import { CurrentUser, GatewayUserAuthGuard, type AuthenticatedUser } from '@dexa/common';
import { changePasswordRequestSchema, type ChangePasswordRequest } from '@dexa/contracts';
import { Body, Controller, HttpCode, HttpStatus, Inject, Patch, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import {
  PASSWORD_CHANGE_SERVICE,
  type IPasswordChangeService,
} from './password-change-service.interface.js';

// The gateway checks the user and forwards its own signed token here, so GatewayUserAuthGuard admits it.
@Controller('auth')
export class PasswordChangeController {
  constructor(
    @Inject(PASSWORD_CHANGE_SERVICE) private readonly passwordChanges: IPasswordChangeService,
  ) {}

  @Patch('me/password')
  @UseGuards(GatewayUserAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(changePasswordRequestSchema)) request: ChangePasswordRequest,
  ): Promise<void> {
    await this.passwordChanges.changePassword(user.accountId, request);
  }
}
