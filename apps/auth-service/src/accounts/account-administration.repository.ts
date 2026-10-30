import type { Database } from '@dexa/db';
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DATABASE } from '../infrastructure/db/database.token.js';
import { accounts } from '../infrastructure/db/schema.js';
import { toAccountWriteError } from './account.repository.js';
import type {
  IAccountAdministrationRepository,
  IAccountAdministrationTransaction,
} from './account-administration.repository.interface.js';

// Only the statements below run in the transaction, so the query runner needs these two methods.
type AccountAdministrationRunner = Pick<Database['db'], 'insert' | 'update'>;

@Injectable()
export class AccountAdministrationRepository implements IAccountAdministrationRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  // The password hash is bound into the statements, and a driver error carries those bind parameters.
  // toAccountWriteError keeps only the SQLSTATE and the database's own message, as the other account writes do.
  async runInTransaction<TResult>(
    work: (transaction: IAccountAdministrationTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    try {
      return await this.database.db.transaction((transaction) =>
        work(createTransactionScope(transaction)),
      );
    } catch (error: unknown) {
      throw toAccountWriteError(error);
    }
  }

  async updateIsActive(accountId: string, isActive: boolean): Promise<boolean | undefined> {
    const rows = await this.database.db
      .update(accounts)
      .set({ isActive })
      .where(eq(accounts.id, accountId))
      .returning({ isActive: accounts.isActive });
    const [row] = rows;
    return row?.isActive;
  }
}

function createTransactionScope(
  runner: AccountAdministrationRunner,
): IAccountAdministrationTransaction {
  return {
    insert: (table) => runner.insert(table),
    replacePasswordHash: (accountId, passwordHash) =>
      replacePasswordHash(runner, accountId, passwordHash),
  };
}

// Only the password column is written. The update is by ID alone, because an HR reset overrides the
// stored hash without verifying it (DATABASE §3.2).
async function replacePasswordHash(
  runner: AccountAdministrationRunner,
  accountId: string,
  passwordHash: string,
): Promise<boolean> {
  const rows = await runner
    .update(accounts)
    .set({ passwordHash })
    .where(eq(accounts.id, accountId))
    .returning({ id: accounts.id });
  return rows.length === 1;
}
