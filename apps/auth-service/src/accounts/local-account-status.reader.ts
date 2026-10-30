import type { IAccountStatusReader } from '@dexa/common';
import type { AccountStatus } from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import {
  ACCOUNT_LOOKUP_READER,
  type IAccountLookupReader,
} from './account-lookup-reader.interface.js';

// auth-service owns accounts, so it reads the flag from its own table rather than calling itself over HTTP.
@Injectable()
export class LocalAccountStatusReader implements IAccountStatusReader {
  constructor(@Inject(ACCOUNT_LOOKUP_READER) private readonly lookups: IAccountLookupReader) {}

  async findAccountStatus(accountId: string): Promise<AccountStatus | undefined> {
    const isActive = await this.lookups.findIsActiveByAccountId(accountId);
    return isActive === undefined ? undefined : { isActive };
  }
}
