import { ConflictError, isUniqueViolation } from '@dexa/common';
import { ErrorCode, type Role } from '@dexa/contracts';
import type { Database } from '@dexa/db';
import { Inject, Injectable } from '@nestjs/common';
import { DrizzleQueryError, and, eq, sql } from 'drizzle-orm';
import { DATABASE } from '../infrastructure/db/database.token.js';
import {
  accountProvisioningOperations,
  accounts,
  masterRoles,
} from '../infrastructure/db/schema.js';
import type { IAccountTransaction, NewAccount } from './account-transaction.interface.js';
import type {
  AccountRecord,
  IAccountRepository,
  SignInAccountRecord,
} from './account.repository.interface.js';

// A query runs on the connection pool or inside one transaction. Both expose the same methods.
type AccountQueryRunner = Pick<Database['db'], 'select' | 'insert' | 'execute'>;

// An account that provisioning has created but HR has not yet activated has this status (DATABASE §3.1).
const PENDING_PROVISIONING_STATUS = 'PENDING';

// accounts.id is unique in the operations table, so this join yields at most one row per account.
export const pendingProvisioningCondition = and(
  eq(accountProvisioningOperations.accountId, accounts.id),
  eq(accountProvisioningOperations.status, PENDING_PROVISIONING_STATUS),
);

const accountStateColumns = {
  id: accounts.id,
  companyEmail: accounts.companyEmail,
  roleCode: masterRoles.code,
  isActive: accounts.isActive,
  pendingProvisioningOperationId: accountProvisioningOperations.operationId,
};

type AccountStateRow = {
  readonly id: string;
  readonly companyEmail: string;
  readonly roleCode: string;
  readonly isActive: boolean;
  readonly pendingProvisioningOperationId: string | null;
};

@Injectable()
export class AccountRepository implements IAccountRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  hasAccountWithRole(roleCode: Role): Promise<boolean> {
    return queryHasAccountWithRole(this.database.db, roleCode);
  }

  findSignInAccountByEmail(companyEmail: string): Promise<SignInAccountRecord | undefined> {
    return querySignInAccountByEmail(this.database.db, companyEmail);
  }

  findAccountById(accountId: string): Promise<AccountRecord | undefined> {
    return queryAccountById(this.database.db, accountId);
  }

  runExclusiveTransaction<TResult>(
    lockKey: number,
    work: (transaction: IAccountTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    return this.database.db.transaction(async (transaction) => {
      // The lock is released when the transaction ends, so a failed run cannot keep it held.
      await transaction.execute(sql`select pg_advisory_xact_lock(${lockKey})`);
      return work(createTransactionScope(transaction));
    });
  }
}

function createTransactionScope(runner: AccountQueryRunner): IAccountTransaction {
  return {
    hasAccountWithRole: (roleCode) => queryHasAccountWithRole(runner, roleCode),
    createAccount: (account) => insertAccount(runner, account),
  };
}

async function queryHasAccountWithRole(
  runner: AccountQueryRunner,
  roleCode: Role,
): Promise<boolean> {
  const rows = await runner
    .select({ id: accounts.id })
    .from(accounts)
    .innerJoin(masterRoles, eq(accounts.roleId, masterRoles.id))
    .where(eq(masterRoles.code, roleCode))
    .limit(1);
  return rows.length > 0;
}

// lower() on both sides matches the unique index on lower(company_email), so the lookup uses that index.
async function querySignInAccountByEmail(
  runner: AccountQueryRunner,
  companyEmail: string,
): Promise<SignInAccountRecord | undefined> {
  const rows = await runner
    .select({ ...accountStateColumns, passwordHash: accounts.passwordHash })
    .from(accounts)
    .innerJoin(masterRoles, eq(accounts.roleId, masterRoles.id))
    .leftJoin(accountProvisioningOperations, pendingProvisioningCondition)
    .where(sql`lower(${accounts.companyEmail}) = lower(${companyEmail})`)
    .limit(1);
  const [row] = rows;
  if (row === undefined) return undefined;
  return { ...toAccountRecord(row), passwordHash: row.passwordHash };
}

async function queryAccountById(
  runner: AccountQueryRunner,
  accountId: string,
): Promise<AccountRecord | undefined> {
  const rows = await runner
    .select(accountStateColumns)
    .from(accounts)
    .innerJoin(masterRoles, eq(accounts.roleId, masterRoles.id))
    .leftJoin(accountProvisioningOperations, pendingProvisioningCondition)
    .where(eq(accounts.id, accountId))
    .limit(1);
  const [row] = rows;
  return row === undefined ? undefined : toAccountRecord(row);
}

function toAccountRecord(row: AccountStateRow): AccountRecord {
  return {
    id: row.id,
    companyEmail: row.companyEmail,
    roleCode: row.roleCode,
    isActive: row.isActive,
    isProvisioningPending: row.pendingProvisioningOperationId !== null,
  };
}

async function insertAccount(runner: AccountQueryRunner, account: NewAccount): Promise<void> {
  const roleId = await queryRoleId(runner, account.roleCode);
  try {
    await runner.insert(accounts).values({
      companyEmail: account.companyEmail,
      passwordHash: account.passwordHash,
      roleId,
      isActive: true,
    });
  } catch (error: unknown) {
    throw toAccountWriteError(error);
  }
}

async function queryRoleId(runner: AccountQueryRunner, roleCode: Role): Promise<string> {
  const rows = await runner
    .select({ id: masterRoles.id })
    .from(masterRoles)
    .where(eq(masterRoles.code, roleCode))
    .limit(1);
  const [role] = rows;
  // Migrations seed every role that authorization uses, so a missing row means a broken database.
  if (role === undefined) throw new Error(`Role ${roleCode} is missing from master_roles.`);
  return role.id;
}

// Drizzle's error message lists the bind parameters, and this insert binds the password hash. The
// error that leaves the repository therefore carries neither the query nor its parameters. It keeps
// only the driver cause, which holds the SQLSTATE and the database's own message.
function toAccountWriteError(error: unknown): Error {
  if (isUniqueViolation(error)) {
    return new ConflictError(ErrorCode.CONFLICT, 'An account already uses this company email.');
  }
  return new Error('Could not write the account.', { cause: unwrapDriverError(error) });
}

function unwrapDriverError(error: unknown): unknown {
  return error instanceof DrizzleQueryError ? error.cause : error;
}
