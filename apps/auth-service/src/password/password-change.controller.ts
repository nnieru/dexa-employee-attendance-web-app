import { CurrentUser, JwtAuthGuard, type AuthenticatedUser } from '@dexa/common';
import { changePasswordRequestSchema, type ChangePasswordRequest } from '@dexa/contracts';
import { Body, Controller, HttpCode, HttpStatus, Inject, Patch, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import {
  PASSWORD_CHANGE_SERVICE,
  type IPasswordChangeService,
} from './password-change-service.interface.js';

// The gateway forwards the user's token here, so JwtAuthGuard verifies it on this service.
@Controller('auth')
export class PasswordChangeController {
  constructor(
    @Inject(PASSWORD_CHANGE_SERVICE) private readonly passwordChanges: IPasswordChangeService,
  ) {}

  @Patch('me/password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(changePasswordRequestSchema)) request: ChangePasswordRequest,
  ): Promise<void> {
    await this.passwordChanges.changePassword(user.accountId, request);
  }
}
