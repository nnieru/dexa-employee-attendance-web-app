import { ErrorCode, type OwnProfile } from '@dexa/contracts';
import { NotFoundError } from '@dexa/common';
import { Inject, Injectable } from '@nestjs/common';
import {
  AUTH_ACCOUNT_CLIENT,
  type IAuthAccountClient,
} from '../auth-accounts/auth-account-client.interface.js';
import {
  EMPLOYEE_PROFILE_READER,
  type IEmployeeProfileReader,
} from './employee-profile.reader.interface.js';
import type { IOwnProfileService } from './own-profile.service.interface.js';
import { toOwnProfile } from './own-profile.rules.js';

const PROFILE_NOT_FOUND_MESSAGE = 'Employee profile not found.';

@Injectable()
export class OwnProfileService implements IOwnProfileService {
  constructor(
    @Inject(EMPLOYEE_PROFILE_READER) private readonly profiles: IEmployeeProfileReader,
    @Inject(AUTH_ACCOUNT_CLIENT) private readonly accounts: IAuthAccountClient,
  ) {}

  async getOwnProfile(accountId: string): Promise<OwnProfile> {
    const profile = await this.profiles.findProfileByAccountId(accountId);
    if (profile === undefined) throw profileNotFound();
    // The email lives in Auth. Without the account, the profile is refused whole rather than served partly.
    const account = await this.accounts.findAccountById(accountId);
    if (account === undefined) throw profileNotFound();
    return toOwnProfile(profile, account.email);
  }
}

function profileNotFound(): NotFoundError {
  return new NotFoundError(ErrorCode.NOT_FOUND, PROFILE_NOT_FOUND_MESSAGE);
}
