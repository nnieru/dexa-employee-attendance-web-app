import type { Database } from '@dexa/db';
import { profileStatusSchema } from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DATABASE } from '../infrastructure/db/database.token.js';
import { wrapStorageError } from '../infrastructure/db/storage-errors.js';
import { employees } from '../infrastructure/db/schema.js';
import { findMasterAssignmentViolation } from '../masters/master-assignment-violation.js';
import { masterNotAssignableError } from '../masters/master-assignment.errors.js';
import type {
  EmployeeFieldsChanges,
  EmployeeFieldsUpdate,
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
  // A rejected master option is the one error that a caller can act on, so it is named as a 400 instead.
  async runInTransaction<TResult>(
    work: (transaction: IEmployeeProfileTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    try {
      return await this.database.db.transaction((transaction) =>
        work(createTransactionScope(transaction)),
      );
    } catch (error: unknown) {
      const field = findMasterAssignmentViolation(error);
      if (field !== undefined) throw masterNotAssignableError(field);
      throw wrapStorageError(error, 'Could not write the employee profile.');
    }
  }
}

function createTransactionScope(runner: EmployeeProfileRunner): IEmployeeProfileTransaction {
  return {
    lockProfileForUpdate: (accountId) => lockProfileForUpdate(runner, accountId),
    updatePhone: (update) => updatePhone(runner, update),
    updatePhoto: (update) => updatePhoto(runner, update),
    updateFields: (update) => updateFields(runner, update),
  };
}

// FOR UPDATE serializes concurrent edits of one profile, so the plan is decided from the stored values.
async function lockProfileForUpdate(
  runner: EmployeeProfileRunner,
  accountId: string,
): Promise<LockedEmployeeProfile | undefined> {
  const [row] = await runner
    .select({
      accountId: employees.accountId,
      name: employees.name,
      positionId: employees.positionId,
      employeeStatusId: employees.employeeStatusId,
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

// Drizzle rejects an undefined value in a SET, so only the columns that changed are named.
async function updateFields(
  runner: EmployeeProfileRunner,
  update: EmployeeFieldsUpdate,
): Promise<void> {
  await runner
    .update(employees)
    .set(toColumnValues(update.changes))
    .where(eq(employees.accountId, update.accountId));
}

function toColumnValues(changes: EmployeeFieldsChanges): Partial<typeof employees.$inferInsert> {
  return {
    ...(changes.name === undefined ? {} : { name: changes.name }),
    ...(changes.positionId === undefined ? {} : { positionId: changes.positionId }),
    ...(changes.phoneNumber === undefined ? {} : { phoneNumber: changes.phoneNumber }),
    ...(changes.employeeStatusId === undefined
      ? {}
      : { employeeStatusId: changes.employeeStatusId }),
    ...(changes.profileStatus === undefined ? {} : { profileStatus: changes.profileStatus }),
  };
}
