import { isUniqueViolation, readUniqueViolationConstraint } from '@dexa/common';
import { AccountProvisioningStatus, accountProvisioningStatusSchema } from '@dexa/contracts';
import type { Database } from '@dexa/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import {
  queryAccountById,
  queryRoleId,
  toAccountWriteError,
  type AccountQueryRunner,
} from '../accounts/account.repository.js';
import type { HrActorAccount } from '../accounts/hr-actor.rules.js';
import { DATABASE } from '../infrastructure/db/database.token.js';
import { accountProvisioningOperations, accounts } from '../infrastructure/db/schema.js';
import type {
  InsertProvisioningOperationResult,
  InsertRejection,
  IAccountProvisioningRepository,
  NewProvisioningOperation,
  ProvisioningOperationRecord,
} from './account-provisioning.repository.interface.js';

// Index and constraint names from DATABASE §3 and the schema. The driver reports the one that refused a row.
const ACCOUNT_EMAIL_CONSTRAINT = 'accounts_company_email_uq';
const OPERATION_ID_CONSTRAINT = 'account_provisioning_operations_operation_id_pk';

const operationColumns = {
  operationId: accountProvisioningOperations.operationId,
  accountId: accountProvisioningOperations.accountId,
  actorAccountId: accountProvisioningOperations.actorAccountId,
  requestedEmail: accountProvisioningOperations.requestedEmail,
  requestedRole: accountProvisioningOperations.requestedRole,
  initialPasswordHash: accountProvisioningOperations.initialPasswordHash,
  status: accountProvisioningOperations.status,
};

// varchar columns come back as plain strings, so the status is checked here before it is typed.
type OperationRow = {
  readonly operationId: string;
  readonly accountId: string;
  readonly actorAccountId: string;
  readonly requestedEmail: string;
  readonly requestedRole: string;
  readonly initialPasswordHash: string;
  readonly status: string;
};

@Injectable()
export class AccountProvisioningRepository implements IAccountProvisioningRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  findActorAccount(accountId: string): Promise<HrActorAccount | undefined> {
    return queryAccountById(this.database.db, accountId);
  }

  async findOperation(operationId: string): Promise<ProvisioningOperationRecord | undefined> {
    const rows = await this.database.db
      .select(operationColumns)
      .from(accountProvisioningOperations)
      .where(eq(accountProvisioningOperations.operationId, operationId))
      .limit(1);
    const [row] = rows;
    return row === undefined ? undefined : toOperationRecord(row);
  }

  async createAccountWithOperation(
    newOperation: NewProvisioningOperation,
  ): Promise<InsertProvisioningOperationResult> {
    try {
      const operation = await this.database.db.transaction((transaction) =>
        insertAccountWithOperation(transaction, newOperation),
      );
      return { kind: 'INSERTED', operation };
    } catch (error: unknown) {
      return { kind: toInsertRejection(error) };
    }
  }

  async activatePendingOperation(operationId: string): Promise<void> {
    // The status predicate makes this a no-op for an ACTIVE or unknown operation, so a repeated call is safe.
    await this.database.db
      .update(accountProvisioningOperations)
      .set({ status: AccountProvisioningStatus.ACTIVE })
      .where(
        and(
          eq(accountProvisioningOperations.operationId, operationId),
          eq(accountProvisioningOperations.status, AccountProvisioningStatus.PENDING),
        ),
      );
  }
}

// The account is inserted first because the operation references it. Both rows commit together or not at all.
async function insertAccountWithOperation(
  transaction: AccountQueryRunner,
  newOperation: NewProvisioningOperation,
): Promise<ProvisioningOperationRecord> {
  const roleId = await queryRoleId(transaction, newOperation.roleCode);
  const [account] = await transaction
    .insert(accounts)
    .values({
      companyEmail: newOperation.companyEmail,
      passwordHash: newOperation.initialPasswordHash,
      roleId,
      isActive: true,
    })
    .returning({ id: accounts.id });
  if (account === undefined) throw new Error('The account insert returned no row.');
  const [operation] = await transaction
    .insert(accountProvisioningOperations)
    .values({
      operationId: newOperation.operationId,
      accountId: account.id,
      actorAccountId: newOperation.actorAccountId,
      requestedEmail: newOperation.companyEmail,
      requestedRole: newOperation.roleCode,
      initialPasswordHash: newOperation.initialPasswordHash,
      status: AccountProvisioningStatus.PENDING,
    })
    .returning(operationColumns);
  if (operation === undefined) throw new Error('The operation insert returned no row.');
  return toOperationRecord(operation);
}

// A unique violation from either insert means a row already holds the value. Any other failure is
// sanitized by toAccountWriteError, because its Drizzle message lists the password hash as a bind parameter.
function toInsertRejection(error: unknown): InsertRejection {
  if (!isUniqueViolation(error)) throw toAccountWriteError(error);
  switch (readUniqueViolationConstraint(error)) {
    case ACCOUNT_EMAIL_CONSTRAINT:
      return 'EMAIL_TAKEN';
    case OPERATION_ID_CONSTRAINT:
      return 'OPERATION_ID_TAKEN';
    // The account ID is a fresh random UUID, so its unique index cannot be the one that failed.
    default:
      throw toAccountWriteError(error);
  }
}

function toOperationRecord(row: OperationRow): ProvisioningOperationRecord {
  return { ...row, status: accountProvisioningStatusSchema.parse(row.status) };
}
