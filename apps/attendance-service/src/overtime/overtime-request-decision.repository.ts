import { DomainError } from '@dexa/common';
import type { Database } from '@dexa/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DATABASE } from '../infrastructure/db/database.token.js';
import { wrapStorageError } from '../infrastructure/db/storage-errors.js';
import { attendanceDays, overtimeRequests } from '../infrastructure/db/schema.js';
import { REQUEST_STATUS } from '../requests/request-decision.rules.js';
import { RequestAlreadyDecidedError } from '../requests/request-decision.errors.js';
import type { PunchRunner } from '../punches/punch.repository.js';
import {
  type IOvertimeRequestDecisionRepository,
  type IOvertimeRequestDecisionTransaction,
  type LockedOvertimeRequest,
  type NewRequestDecision,
} from './overtime-request-decision.repository.interface.js';
import {
  storedOvertimeRequestColumns,
  toStoredOvertimeRequest,
} from './overtime-request.repository.js';

// The decision locks and writes only the request row. The day is joined only for its business date.
@Injectable()
export class OvertimeRequestDecisionRepository implements IOvertimeRequestDecisionRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async runInTransaction<TResult>(
    work: (transaction: IOvertimeRequestDecisionTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    try {
      return await this.database.db.transaction((transaction) =>
        work(createDecisionTransactionScope(transaction)),
      );
    } catch (error: unknown) {
      if (error instanceof DomainError) throw error;
      throw wrapStorageError(error, 'Could not record the overtime request decision.');
    }
  }
}

function createDecisionTransactionScope(runner: PunchRunner): IOvertimeRequestDecisionTransaction {
  return {
    insert: (table) => runner.insert(table),
    findRequestForUpdate: (requestId) => findRequestForUpdate(runner, requestId),
    recordDecision: (decision) => recordDecision(runner, decision),
  };
}

// The row lock is taken on the request only. The joined day is read for the business date and is not locked.
async function findRequestForUpdate(
  runner: PunchRunner,
  requestId: string,
): Promise<LockedOvertimeRequest | undefined> {
  const [row] = await runner
    .select({
      ...storedOvertimeRequestColumns,
      requesterAccountId: overtimeRequests.requestedByAccountId,
    })
    .from(overtimeRequests)
    .innerJoin(attendanceDays, eq(attendanceDays.id, overtimeRequests.attendanceDayId))
    .where(eq(overtimeRequests.id, requestId))
    .limit(1)
    .for('update', { of: overtimeRequests });
  if (row === undefined) return undefined;
  const { requesterAccountId, ...storedRow } = row;
  return { ...toStoredOvertimeRequest(storedRow), requesterAccountId };
}

// The PENDING condition is a second guard behind the row lock. A decided request matches no row, so it is not written.
async function recordDecision(runner: PunchRunner, decision: NewRequestDecision): Promise<void> {
  const updatedRows = await runner
    .update(overtimeRequests)
    .set({
      status: decision.status,
      reviewedByAccountId: decision.reviewerAccountId,
      reviewedAt: decision.reviewedAt,
      reviewReason: decision.reviewReason,
    })
    .where(
      and(
        eq(overtimeRequests.id, decision.requestId),
        eq(overtimeRequests.status, REQUEST_STATUS.PENDING),
      ),
    )
    .returning({ id: overtimeRequests.id });
  if (updatedRows.length === 0) throw new RequestAlreadyDecidedError();
}
