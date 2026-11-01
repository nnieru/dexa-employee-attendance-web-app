import { CLOCK, type IClock } from '@dexa/common';
import type {
  ApproveOvertimeRequest,
  OvertimeRequest,
  RejectOvertimeRequest,
} from '@dexa/contracts';
import { OUTBOX_WRITER, type IOutboxWriter } from '@dexa/messaging';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  RequestNotFoundError,
  toRequestDecisionError,
} from '../requests/request-decision.errors.js';
import {
  evaluateRequestDecision,
  REQUEST_STATUS,
  type TerminalRequestStatus,
} from '../requests/request-decision.rules.js';
import {
  attendanceRequestDecisionEventType,
  buildAttendanceRequestEvent,
} from '../requests/attendance-request-event.rules.js';
import {
  OVERTIME_REQUEST_DECISION_REPOSITORY,
  type IOvertimeRequestDecisionRepository,
  type IOvertimeRequestDecisionTransaction,
  type LockedOvertimeRequest,
} from './overtime-request-decision.repository.interface.js';
import type { IOvertimeRequestDecisionService } from './overtime-request-decision.service.interface.js';
import { toOvertimeRequest } from './overtime-request.rules.js';

type DecisionCommand = {
  readonly reviewerAccountId: string;
  readonly requestId: string;
  readonly targetStatus: TerminalRequestStatus;
  readonly reviewReason: string | null;
};

@Injectable()
export class OvertimeRequestDecisionService implements IOvertimeRequestDecisionService {
  constructor(
    @Inject(OVERTIME_REQUEST_DECISION_REPOSITORY)
    private readonly decisions: IOvertimeRequestDecisionRepository,
    @Inject(OUTBOX_WRITER) private readonly outbox: IOutboxWriter,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async approve(
    reviewerAccountId: string,
    requestId: string,
    input: ApproveOvertimeRequest,
  ): Promise<OvertimeRequest> {
    return this.decide({
      reviewerAccountId,
      requestId,
      targetStatus: REQUEST_STATUS.APPROVED,
      reviewReason: input.reviewReason ?? null,
    });
  }

  async reject(
    reviewerAccountId: string,
    requestId: string,
    input: RejectOvertimeRequest,
  ): Promise<OvertimeRequest> {
    return this.decide({
      reviewerAccountId,
      requestId,
      targetStatus: REQUEST_STATUS.REJECTED,
      reviewReason: input.reviewReason,
    });
  }

  private async decide(command: DecisionCommand): Promise<OvertimeRequest> {
    const decided = await this.decisions.runInTransaction((transaction) =>
      this.decideInTransaction(transaction, command),
    );
    return toOvertimeRequest(decided);
  }

  // The row is locked before the rule runs, so the status it judges is the one that will be stored. The reviewed instant
  // is read after the lock, so it is never earlier than the decision it records.
  private async decideInTransaction(
    transaction: IOvertimeRequestDecisionTransaction,
    command: DecisionCommand,
  ): Promise<LockedOvertimeRequest> {
    const locked = await transaction.findRequestForUpdate(command.requestId);
    if (locked === undefined) throw new RequestNotFoundError();

    const reviewReason = normalizeReviewReason(command.reviewReason);
    const outcome = evaluateRequestDecision({
      currentStatus: locked.status,
      targetStatus: command.targetStatus,
      requestedByAccountId: locked.requesterAccountId,
      reviewerAccountId: command.reviewerAccountId,
      reviewReason,
    });
    if (outcome.kind === 'violation') throw toRequestDecisionError(outcome.violation);
    if (outcome.kind === 'replay') return locked;

    const reviewedAt = this.clock.now();
    await transaction.recordDecision({
      requestId: command.requestId,
      status: outcome.nextStatus,
      reviewerAccountId: command.reviewerAccountId,
      reviewedAt,
      reviewReason,
    });
    await this.outbox.add(
      transaction,
      buildAttendanceRequestEvent({
        eventId: randomUUID(),
        eventType: attendanceRequestDecisionEventType(outcome.nextStatus),
        occurredAt: reviewedAt,
        accountId: locked.requesterAccountId,
        actorAccountId: command.reviewerAccountId,
        resourceType: 'overtime_request',
        resourceId: locked.id,
        businessDate: locked.businessDate,
      }),
    );
    return { ...locked, status: outcome.nextStatus, reviewReason, reviewedAt };
  }
}

// A blank reason is no reason. For a rejection the rule then refuses it, and for an approval it is stored as null, so
// review_reason is never an empty string.
function normalizeReviewReason(reviewReason: string | null): string | null {
  if (reviewReason === null || reviewReason.trim().length === 0) return null;
  return reviewReason;
}
