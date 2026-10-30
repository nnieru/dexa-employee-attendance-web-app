import { DependencyUnavailableError } from '@dexa/common';
import type { AccountLookupItem, EmployeeListPage, EmployeeListQuery } from '@dexa/contracts';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AUTH_ACCOUNT_CLIENT,
  type IAuthAccountClient,
} from '../auth-accounts/auth-account-client.interface.js';
import {
  EMPLOYEE_LIST_READER,
  type EmployeeListRecord,
  type EmployeeListSearch,
  type IEmployeeListReader,
} from './employee-list-reader.interface.js';
import type { IEmployeeListService } from './employee-list-service.interface.js';
import { toEmployeeListItem, toEmployeeListPage } from './employee-list.rules.js';

@Injectable()
export class EmployeeListService implements IEmployeeListService {
  private readonly logger = new Logger(EmployeeListService.name);

  constructor(
    @Inject(EMPLOYEE_LIST_READER) private readonly reader: IEmployeeListReader,
    @Inject(AUTH_ACCOUNT_CLIENT) private readonly accounts: IAuthAccountClient,
  ) {}

  async listEmployees(query: EmployeeListQuery): Promise<EmployeeListPage> {
    const search = query.q === undefined ? undefined : await this.resolveSearch(query.q);
    const { records, totalItems } = await this.reader.findEmployeePage({
      page: query.page,
      pageSize: query.pageSize,
      search,
    });
    const accountsById = await this.lookupPageAccounts(records);
    const items = records.map((record) =>
      toEmployeeListItem(record, accountsById.get(record.accountId)),
    );
    return toEmployeeListPage(items, query, totalItems);
  }

  // The email part of a search can only come from Auth. If Auth is unavailable, the search fails with 503 rather
  // than returning name matches alone, because those would look like the complete answer (D-15).
  private async resolveSearch(nameTerm: string): Promise<EmployeeListSearch> {
    const emailMatchAccountIds = await this.accounts.searchAccountIdsByEmail(nameTerm);
    return { nameTerm, emailMatchAccountIds };
  }

  // One batched lookup covers the page, and none runs for an empty page. Unlike the search, the email and role
  // are display data, so an unavailable Auth shows those cells as null and keeps the rest of the page (DATABASE §8).
  private async lookupPageAccounts(
    records: ReadonlyArray<EmployeeListRecord>,
  ): Promise<ReadonlyMap<string, AccountLookupItem>> {
    if (records.length === 0) return new Map();
    try {
      const accounts = await this.accounts.lookupAccounts(
        records.map((record) => record.accountId),
      );
      return new Map(accounts.map((account) => [account.id, account]));
    } catch (error: unknown) {
      if (!(error instanceof DependencyUnavailableError)) throw error;
      this.logger.warn('Account lookup is unavailable; the page shows no emails or roles.');
      return new Map();
    }
  }
}
