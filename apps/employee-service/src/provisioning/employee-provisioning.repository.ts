import type { Database } from '@dexa/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DATABASE } from '../infrastructure/db/database.token.js';
import { wrapStorageError } from '../infrastructure/db/storage-errors.js';
import { employeeProvisioningOperations, employees } from '../infrastructure/db/schema.js';
import { findMasterAssignmentViolation } from '../masters/master-assignment-violation.js';
import {
  employeeProvisioningStateSchema,
  EmployeeProvisioningState,
} from './employee-provisioning-state.js';
import type {
  EmployeeProvisioningOperation,
  IEmployeeProvisioningRepository,
  NewEmployeeProfile,
  NewEmployeeProvisioningOperation,
  ProfileSaveOutcome,
} from './employee-provisioning.repository.interface.js';

// Only the statements that a transaction runs need the update and insert methods.
type ProvisioningRunner = Pick<Database['db'], 'select' | 'insert' | 'update'>;

const operationColumns = {
  operationId: employeeProvisioningOperations.operationId,
  actorAccountId: employeeProvisioningOperations.actorAccountId,
  requestFingerprintSha256: employeeProvisioningOperations.requestFingerprintSha256,
  accountId: employeeProvisioningOperations.accountId,
  state: employeeProvisioningOperations.state,
};

// varchar columns come back as plain strings, so each one is parsed before it is typed.
type OperationRow = {
  readonly operationId: string;
  readonly actorAccountId: string;
  readonly requestFingerprintSha256: string;
  readonly accountId: string | null;
  readonly state: string;
};

// Each column is named explicitly, so a column added to the table never reaches the caller by accident.
@Injectable()
export class EmployeeProvisioningRepository implements IEmployeeProvisioningRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  findOperation(operationId: string): Promise<EmployeeProvisioningOperation | undefined> {
    return sanitizeStorageErrors(async () => {
      const [row] = await this.database.db
        .select(operationColumns)
        .from(employeeProvisioningOperations)
        .where(eq(employeeProvisioningOperations.operationId, operationId))
        .limit(1);
      return row === undefined ? undefined : toOperation(row);
    });
  }

  // The ON CONFLICT on the primary key leaves a stored row as it is. The read then returns that row, so the caller
  // compares it with its own request and never overwrites a reservation.
  reserveOperation(
    operation: NewEmployeeProvisioningOperation,
  ): Promise<EmployeeProvisioningOperation> {
    return sanitizeStorageErrors(async () => {
      await this.database.db
        .insert(employeeProvisioningOperations)
        .values({ ...operation, accountId: null, state: EmployeeProvisioningState.RESERVED })
        .onConflictDoNothing({ target: employeeProvisioningOperations.operationId });
      const stored = await this.findOperation(operation.operationId);
      if (stored === undefined)
        throw new Error('The reserved operation is missing after its insert.');
      return stored;
    });
  }

  // A rejected master is reported as its field, so the caller can answer 400. The trigger's exception rolls the
  // transaction back first, so no partial profile is left behind.
  async saveProfileForReservedOperation(
    operationId: string,
    profile: NewEmployeeProfile,
  ): Promise<ProfileSaveOutcome> {
    try {
      return await this.database.db.transaction((transaction) =>
        saveProfileInTransaction(transaction, operationId, profile),
      );
    } catch (error: unknown) {
      const field = findMasterAssignmentViolation(error);
      if (field !== undefined) return { kind: 'MASTER_NOT_ASSIGNABLE', field };
      throw toStorageError(error);
    }
  }

  markOperationActive(operationId: string): Promise<void> {
    return sanitizeStorageErrors(async () => {
      // The state predicate makes this a no-op for any phase other than PROFILE_SAVED, so a repeat is safe.
      await this.database.db
        .update(employeeProvisioningOperations)
        .set({ state: EmployeeProvisioningState.ACTIVE })
        .where(
          and(
            eq(employeeProvisioningOperations.operationId, operationId),
            eq(employeeProvisioningOperations.state, EmployeeProvisioningState.PROFILE_SAVED),
          ),
        );
    });
  }
}

// FOR UPDATE serializes two requests that save the same operation, so only one of them sees RESERVED.
async function saveProfileInTransaction(
  transaction: ProvisioningRunner,
  operationId: string,
  profile: NewEmployeeProfile,
): Promise<ProfileSaveOutcome> {
  const [locked] = await transaction
    .select({ state: employeeProvisioningOperations.state })
    .from(employeeProvisioningOperations)
    .where(eq(employeeProvisioningOperations.operationId, operationId))
    .limit(1)
    .for('update');
  if (locked === undefined) throw new Error('The operation to save is missing.');
  const state = employeeProvisioningStateSchema.parse(locked.state);
  if (state !== EmployeeProvisioningState.RESERVED) return { kind: 'ALREADY_SAVED', state };

  // An existing profile is never taken over or overwritten, so a conflicting row is reported, not updated.
  const inserted = await transaction
    .insert(employees)
    .values({
      accountId: profile.accountId,
      name: profile.name,
      positionId: profile.positionId,
      employeeStatusId: profile.employeeStatusId,
      profileStatus: profile.profileStatus,
      phoneNumber: profile.phoneNumber,
      photoKey: null,
    })
    .onConflictDoNothing({ target: employees.accountId })
    .returning({ accountId: employees.accountId });
  if (inserted.length === 0) return { kind: 'PROFILE_EXISTS' };

  await transaction
    .update(employeeProvisioningOperations)
    .set({ accountId: profile.accountId, state: EmployeeProvisioningState.PROFILE_SAVED })
    .where(eq(employeeProvisioningOperations.operationId, operationId));
  return { kind: 'SAVED' };
}

function toOperation(row: OperationRow): EmployeeProvisioningOperation {
  return {
    operationId: row.operationId,
    actorAccountId: row.actorAccountId,
    requestFingerprintSha256: row.requestFingerprintSha256,
    accountId: row.accountId ?? undefined,
    state: employeeProvisioningStateSchema.parse(row.state),
  };
}

// Driver errors carry the bind parameters, and the profile insert binds the phone number. Only the SQLSTATE and the
// database message survive, so a failed write never reports personal data or SQL to the caller.
function toStorageError(error: unknown): Error {
  return wrapStorageError(error, 'The employee provisioning record could not be stored.');
}

async function sanitizeStorageErrors<TResult>(work: () => Promise<TResult>): Promise<TResult> {
  try {
    return await work();
  } catch (error: unknown) {
    throw toStorageError(error);
  }
}
