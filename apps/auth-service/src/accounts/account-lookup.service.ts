import { NotFoundError } from '@dexa/common';
import {
  ACCOUNT_SEARCH_MAX_IDS,
  ErrorCode,
  Role,
  roleSchema,
  type AccountIdPage,
  type AccountLookupItem,
  type AccountReference,
  type AccountSearchResponse,
  type AccountStatus,
  type PaginationQuery,
} from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import {
  ACCOUNT_LOOKUP_READER,
  type AccountIdentityRecord,
  type IAccountLookupReader,
} from './account-lookup-reader.interface.js';
import type { IAccountLookupService } from './account-lookup-service.interface.js';

@Injectable()
export class AccountLookupService implements IAccountLookupService {
  constructor(@Inject(ACCOUNT_LOOKUP_READER) private readonly reader: IAccountLookupReader) {}

  async lookupAccounts(accountIds: ReadonlyArray<string>): Promise<AccountLookupItem[]> {
    const identities = await this.reader.findIdentitiesByIds(accountIds);
    return identities.map(toLookupItem);
  }

  async listHrRecipientIds(query: PaginationQuery): Promise<AccountIdPage> {
    const window = { limit: query.pageSize, offset: (query.page - 1) * query.pageSize };
    const [totalItems, items] = await Promise.all([
      this.reader.countHrRecipients(),
      this.reader.listHrRecipientIds(window),
    ]);
    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    };
  }

  async getAccountStatus(accountId: string): Promise<AccountStatus> {
    const isActive = await this.reader.findIsActiveByAccountId(accountId);
    if (isActive === undefined) throw new NotFoundError(ErrorCode.NOT_FOUND, 'Account not found.');
    return { isActive };
  }

  async searchAccounts(emailTerm: string): Promise<AccountSearchResponse> {
    const ids = await this.reader.searchAccountIdsByEmail(emailTerm, ACCOUNT_SEARCH_MAX_IDS);
    return { ids };
  }

  async findAccountByEmail(companyEmail: string): Promise<AccountReference> {
    const identity = await this.reader.findIdentityByEmail(companyEmail);
    if (identity === undefined) {
      throw new NotFoundError(ErrorCode.NOT_FOUND, 'No account uses this company email.');
    }
    return { id: identity.id, role: toRole(identity.roleCode) };
  }
}

function toLookupItem(identity: AccountIdentityRecord): AccountLookupItem {
  return { id: identity.id, email: identity.companyEmail, role: toRole(identity.roleCode) };
}

// A stored role code that the contracts do not list means the database and this service disagree.
// Failing the request is safer than sending a role that no client can interpret.
function toRole(roleCode: string): Role {
  const parsed = roleSchema.safeParse(roleCode);
  if (!parsed.success) throw new Error('Stored account role is not a known role.');
  return parsed.data;
}
