import type { Database } from '@dexa/db';
import { profileStatusSchema } from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { DrizzleQueryError, eq } from 'drizzle-orm';
import { DATABASE } from '../infrastructure/db/database.token.js';
import { employees } from '../infrastructure/db/schema.js';
import type {
  EmployeePhoneUpdate,
  EmployeePhotoUpdate,
  IEmployeeProfileTransaction,
  IEmployeeProfileWriter,
  LockedEmployeeProfile,
} from './employee-profile.writer.interface.js';

// Only the statements below run in the transaction, so the runner needs these three methods.
type EmployeeProfileRunner = Pick<Database['db'], 'select' | 'update'>;

@Injectable()
export class EmployeeProfileWriter implements IEmployeeProfileWriter {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  // Driver errors carry the bind parameters, which include the phone number. Wrapping them keeps only the
  // SQLSTATE and the database's message, so a failed write never leaks SQL or personal data to the caller.
  async runInTransaction<TResult>(
    work: (transaction: IEmployeeProfileTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    try {
      return await this.database.db.transaction((transaction) =>
        work(createTransactionScope(transaction)),
      );
    } catch (error: unknown) {
      throw toEmployeeProfileWriteError(error);
    }
  }
}

function createTransactionScope(runner: EmployeeProfileRunner): IEmployeeProfileTransaction {
  return {
    lockProfileForUpdate: (accountId) => lockProfileForUpdate(runner, accountId),
    updatePhone: (update) => updatePhone(runner, update),
    updatePhoto: (update) => updatePhoto(runner, update),
  };
}

// FOR UPDATE serializes concurrent edits of one profile, so the completion decision sees the stored fields.
async function lockProfileForUpdate(
  runner: EmployeeProfileRunner,
  accountId: string,
): Promise<LockedEmployeeProfile | undefined> {
  const [row] = await runner
    .select({
      accountId: employees.accountId,
      name: employees.name,
      positionId: employees.positionId,
      phoneNumber: employees.phoneNumber,
      photoKey: employees.photoKey,
      profileStatus: employees.profileStatus,
    })
    .from(employees)
    .where(eq(employees.accountId, accountId))
    .limit(1)
    .for('update');
  if (row === undefined) return undefined;
  return { ...row, profileStatus: profileStatusSchema.parse(row.profileStatus) };
}

// Only the phone and the status it implies are written. The set_updated_at trigger stamps updated_at, so the
// write never supplies its own time.
async function updatePhone(
  runner: EmployeeProfileRunner,
  update: EmployeePhoneUpdate,
): Promise<void> {
  await runner
    .update(employees)
    .set({
      phoneNumber: update.phoneNumber,
      profileStatus: update.profileStatus,
    })
    .where(eq(employees.accountId, update.accountId));
}

// Only the photo reference and the status it implies are written. The set_updated_at trigger stamps updated_at.
async function updatePhoto(
  runner: EmployeeProfileRunner,
  update: EmployeePhotoUpdate,
): Promise<void> {
  await runner
    .update(employees)
    .set({
      photoKey: update.photoKey,
      profileStatus: update.profileStatus,
    })
    .where(eq(employees.accountId, update.accountId));
}

function toEmployeeProfileWriteError(error: unknown): Error {
  return new Error('Could not write the employee profile.', { cause: unwrapDriverError(error) });
}

function unwrapDriverError(error: unknown): unknown {
  return error instanceof DrizzleQueryError ? error.cause : error;
}
