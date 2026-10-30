import { CurrentUser, JwtAuthGuard, type AuthenticatedUser } from '@dexa/common';
import type { CurrentAccount } from '@dexa/contracts';
import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import {
  CURRENT_ACCOUNT_SERVICE,
  type ICurrentAccountService,
} from './current-account-service.interface.js';

// The gateway forwards the user's token here, so JwtAuthGuard verifies it on this service.
@Controller('auth')
export class CurrentAccountController {
  constructor(
    @Inject(CURRENT_ACCOUNT_SERVICE) private readonly currentAccounts: ICurrentAccountService,
  ) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getCurrentAccount(@CurrentUser() user: AuthenticatedUser): Promise<CurrentAccount> {
    return this.currentAccounts.getCurrentAccount(user.accountId);
  }
}
