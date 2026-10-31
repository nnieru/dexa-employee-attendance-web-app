import { CurrentUser, GatewayUserAuthGuard, type AuthenticatedUser } from '@dexa/common';
import type { CurrentAccount } from '@dexa/contracts';
import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import {
  CURRENT_ACCOUNT_SERVICE,
  type ICurrentAccountService,
} from './current-account-service.interface.js';

// The gateway checks the user and forwards its own signed token here, so GatewayUserAuthGuard admits it (D-51).
@Controller('auth')
export class CurrentAccountController {
  constructor(
    @Inject(CURRENT_ACCOUNT_SERVICE) private readonly currentAccounts: ICurrentAccountService,
  ) {}

  @Get('me')
  @UseGuards(GatewayUserAuthGuard)
  getCurrentAccount(@CurrentUser() user: AuthenticatedUser): Promise<CurrentAccount> {
    return this.currentAccounts.getCurrentAccount(user.accountId);
  }
}
