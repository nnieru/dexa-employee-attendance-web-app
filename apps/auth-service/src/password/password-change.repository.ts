import type { Database } from '@dexa/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import {
  pendingProvisioningCondition,
  toAccountWriteError,
} from '../accounts/account.repository.js';
import { DATABASE } from '../infrastructure/db/database.token.js';
import { accountProvisioningOperations, accounts } from '../infrastructure/db/schema.js';
import type {
  IPasswordChangeRepository,
  IPasswordChangeTransaction,
  PasswordCredentialRecord,
  PasswordHashReplacement,
} from './password-change.repository.interface.js';

// Only the statements below run in the transaction, so the query runner needs these three methods.
type PasswordChangeRunner = Pick<Database['db'], 'select' | 'insert' | 'update'>;

@Injectable()
export class PasswordChangeRepository implements IPasswordChangeRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findCredentialByAccountId(
    accountId: string,
  ): Promise<PasswordCredentialRecord | undefined> {
    const rows = await this.database.db
      .select({
        accountId: accounts.id,
        passwordHash: accounts.passwordHash,
        isActive: accounts.isActive,
        pendingProvisioningOperationId: accountProvisioningOperations.operationId,
      })
      .from(accounts)
      .leftJoin(accountProvisioningOperations, pendingProvisioningCondition)
      .where(eq(accounts.id, accountId))
      .limit(1);
    const [row] = rows;
    if (row === undefined) return undefined;
    return {
      accountId: row.accountId,
      passwordHash: row.passwordHash,
      isActive: row.isActive,
      isProvisioningPending: row.pendingProvisioningOperationId !== null,
    };
  }

  // Driver errors from this transaction carry the bind parameters, which include both password
  // hashes. Wrapping them here keeps only the SQLSTATE and the database's own message, as the accounts
  // repository does.
  async runInTransaction<TResult>(
    work: (transaction: IPasswordChangeTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    try {
      return await this.database.db.transaction((transaction) =>
        work(createTransactionScope(transaction)),
      );
    } catch (error: unknown) {
      throw toAccountWriteError(error);
    }
  }
}

function createTransactionScope(runner: PasswordChangeRunner): IPasswordChangeTransaction {
  return {
    insert: (table) => runner.insert(table),
    replacePasswordHash: (replacement) => replacePasswordHash(runner, replacement),
  };
}

// Only the password column is written. The conditional match turns a stale change into a zero-row update.
async function replacePasswordHash(
  runner: PasswordChangeRunner,
  replacement: PasswordHashReplacement,
): Promise<boolean> {
  const rows = await runner
    .update(accounts)
    .set({ passwordHash: replacement.newPasswordHash })
    .where(
      and(
        eq(accounts.id, replacement.accountId),
        eq(accounts.passwordHash, replacement.previousPasswordHash),
      ),
    )
    .returning({ id: accounts.id });
  return rows.length === 1;
}
