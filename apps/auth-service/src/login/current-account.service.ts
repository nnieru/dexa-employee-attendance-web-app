import { UnauthorizedError } from '@dexa/common';
import { ErrorCode, type CurrentAccount } from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import {
  ACCOUNT_REPOSITORY,
  type IAccountRepository,
} from '../accounts/account.repository.interface.js';
import { findKnownRole } from './login-eligibility.rules.js';
import type { ICurrentAccountService } from './current-account-service.interface.js';

// A token whose account is missing, still provisioning, or stored with an unknown role does not
// describe a usable session. The client gets the same answer for all three.
const SESSION_NOT_FOUND_MESSAGE = 'Your session is no longer valid. Sign in again.';
// The same text as the gateway's answer, so a client sees one message for a deactivated account.
const ACCOUNT_DISABLED_MESSAGE = 'This account is no longer active.';

@Injectable()
export class CurrentAccountService implements ICurrentAccountService {
  constructor(@Inject(ACCOUNT_REPOSITORY) private readonly accounts: IAccountRepository) {}

  async getCurrentAccount(accountId: string): Promise<CurrentAccount> {
    const account = await this.accounts.findAccountById(accountId);
    if (account === undefined || account.isProvisioningPending) {
      throw new UnauthorizedError(ErrorCode.UNAUTHORIZED, SESSION_NOT_FOUND_MESSAGE);
    }
    // The client signs out on ACCOUNT_DISABLED, so a deactivated account gets its own code.
    if (!account.isActive) {
      throw new UnauthorizedError(ErrorCode.ACCOUNT_DISABLED, ACCOUNT_DISABLED_MESSAGE);
    }
    const role = findKnownRole(account.roleCode);
    if (role === undefined) {
      throw new UnauthorizedError(ErrorCode.UNAUTHORIZED, SESSION_NOT_FOUND_MESSAGE);
    }
    return { id: account.id, email: account.companyEmail, role };
  }
}
