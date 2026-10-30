import { Role } from '@dexa/contracts';
import type { Database } from '@dexa/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, ilike, inArray, isNull, sql } from 'drizzle-orm';
import { DATABASE } from '../infrastructure/db/database.token.js';
import {
  accountProvisioningOperations,
  accounts,
  masterRoles,
} from '../infrastructure/db/schema.js';
import { pendingProvisioningCondition } from './account.repository.js';
import type {
  AccountIdentityByEmailRecord,
  AccountIdentityRecord,
  AccountIdWindow,
  IAccountLookupReader,
} from './account-lookup-reader.interface.js';

// A left join on the PENDING provisioning operation leaves its ID NULL when no such operation exists.
const withoutPendingProvisioning = isNull(accountProvisioningOperations.operationId);

// Only active HR accounts that are past provisioning are recipients of HR notifications (DATABASE §3.1).
const hrRecipientCondition = and(
  eq(masterRoles.code, Role.HR),
  eq(accounts.isActive, true),
  withoutPendingProvisioning,
);

// Postgres LIKE treats backslash as its escape character by default. Escaping the three special
// characters makes the term match literally. The result is still a bound parameter, not SQL text.
const LIKE_SPECIAL_CHARACTERS = /[\\%_]/g;

function toContainsPattern(term: string): string {
  return `%${term.replace(LIKE_SPECIAL_CHARACTERS, (character) => `\\${character}`)}%`;
}

@Injectable()
export class AccountLookupRepository implements IAccountLookupReader {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findIdentitiesByIds(accountIds: ReadonlyArray<string>): Promise<AccountIdentityRecord[]> {
    return this.database.db
      .select({
        id: accounts.id,
        companyEmail: accounts.companyEmail,
        roleCode: masterRoles.code,
      })
      .from(accounts)
      .innerJoin(masterRoles, eq(accounts.roleId, masterRoles.id))
      .leftJoin(accountProvisioningOperations, pendingProvisioningCondition)
      .where(and(inArray(accounts.id, [...accountIds]), withoutPendingProvisioning))
      .orderBy(asc(accounts.id));
  }

  async findIdentityByEmail(
    companyEmail: string,
  ): Promise<AccountIdentityByEmailRecord | undefined> {
    // lower() on both sides matches the unique index on lower(company_email), as sign-in does.
    const rows = await this.database.db
      .select({ id: accounts.id, roleCode: masterRoles.code })
      .from(accounts)
      .innerJoin(masterRoles, eq(accounts.roleId, masterRoles.id))
      .leftJoin(accountProvisioningOperations, pendingProvisioningCondition)
      .where(
        and(
          sql`lower(${accounts.companyEmail}) = lower(${companyEmail})`,
          withoutPendingProvisioning,
        ),
      )
      .limit(1);
    const [row] = rows;
    return row;
  }

  async searchAccountIdsByEmail(emailTerm: string, maxIds: number): Promise<string[]> {
    const rows = await this.database.db
      .select({ id: accounts.id })
      .from(accounts)
      .leftJoin(accountProvisioningOperations, pendingProvisioningCondition)
      .where(
        and(ilike(accounts.companyEmail, toContainsPattern(emailTerm)), withoutPendingProvisioning),
      )
      .orderBy(asc(accounts.id))
      .limit(maxIds);
    return rows.map((row) => row.id);
  }

  async listHrRecipientIds(window: AccountIdWindow): Promise<string[]> {
    const rows = await this.database.db
      .select({ id: accounts.id })
      .from(accounts)
      .innerJoin(masterRoles, eq(accounts.roleId, masterRoles.id))
      .leftJoin(accountProvisioningOperations, pendingProvisioningCondition)
      .where(hrRecipientCondition)
      .orderBy(asc(accounts.id))
      .limit(window.limit)
      .offset(window.offset);
    return rows.map((row) => row.id);
  }

  async countHrRecipients(): Promise<number> {
    const [row] = await this.database.db
      .select({ total: count() })
      .from(accounts)
      .innerJoin(masterRoles, eq(accounts.roleId, masterRoles.id))
      .leftJoin(accountProvisioningOperations, pendingProvisioningCondition)
      .where(hrRecipientCondition);
    return row?.total ?? 0;
  }

  // Reads the stored flag as is. Deactivation must take effect on the next request, so no
  // provisioning state is folded in here.
  async findIsActiveByAccountId(accountId: string): Promise<boolean | undefined> {
    const rows = await this.database.db
      .select({ isActive: accounts.isActive })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);
    const [row] = rows;
    return row?.isActive;
  }
}
