import { CLOCK, type IClock } from '@dexa/common';
import type {
  ApproveCorrectionRequest,
  CorrectionRequest,
  RejectCorrectionRequest,
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
import { applyCorrectionToDay } from './correction-apply.rules.js';
import { AttendanceDayChangedError } from './correction-request.errors.js';
import { toCorrectionRequest } from './correction-request.rules.js';
import {
  CORRECTION_REQUEST_DECISION_REPOSITORY,
  type ICorrectionRequestDecisionRepository,
  type ICorrectionRequestDecisionTransaction,
  type LockedCorrectionRequest,
} from './correction-request-decision.repository.interface.js';
import type { ICorrectionRequestDecisionService } from './correction-request-decision.service.interface.js';

type DecisionCommand = {
  readonly reviewerAccountId: string;
  readonly requestId: string;
  readonly targetStatus: TerminalRequestStatus;
  readonly reviewReason: string | null;
};

@Injectable()
export class CorrectionRequestDecisionService implements ICorrectionRequestDecisionService {
  constructor(
    @Inject(CORRECTION_REQUEST_DECISION_REPOSITORY)
    private readonly decisions: ICorrectionRequestDecisionRepository,
    @Inject(OUTBOX_WRITER) private readonly outbox: IOutboxWriter,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async approve(
    reviewerAccountId: string,
    requestId: string,
    input: ApproveCorrectionRequest,
  ): Promise<CorrectionRequest> {
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
    input: RejectCorrectionRequest,
  ): Promise<CorrectionRequest> {
    return this.decide({
      reviewerAccountId,
      requestId,
      targetStatus: REQUEST_STATUS.REJECTED,
      reviewReason: input.reviewReason,
    });
  }

  private async decide(command: DecisionCommand): Promise<CorrectionRequest> {
    const decided = await this.decisions.runInTransaction((transaction) =>
      this.decideInTransaction(transaction, command),
    );
    return toCorrectionRequest(decided);
  }

  // The request is locked before the rule runs, so the status it judges is the one that will be stored. A replay returns
  // the recorded request and writes nothing. Only a first approval touches the day (DATABASE §5.8).
  private async decideInTransaction(
    transaction: ICorrectionRequestDecisionTransaction,
    command: DecisionCommand,
  ): Promise<LockedCorrectionRequest> {
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

    const appliedRevision =
      outcome.nextStatus === REQUEST_STATUS.APPROVED
        ? await applyApprovedCorrection(transaction, locked)
        : null;
    const reviewedAt = this.clock.now();
    await transaction.recordDecision({
      requestId: command.requestId,
      status: outcome.nextStatus,
      reviewerAccountId: command.reviewerAccountId,
      reviewedAt,
      reviewReason,
      appliedRevision,
    });
    await this.outbox.add(
      transaction,
      buildAttendanceRequestEvent({
        eventId: randomUUID(),
        eventType: attendanceRequestDecisionEventType(outcome.nextStatus),
        occurredAt: reviewedAt,
        accountId: locked.requesterAccountId,
        actorAccountId: command.reviewerAccountId,
        resourceType: 'attendance_adjustment_request',
        resourceId: locked.id,
        businessDate: locked.businessDate,
      }),
    );
    return { ...locked, status: outcome.nextStatus, reviewReason, reviewedAt };
  }
}

// The day is locked after the request. A day that changed since submission is refused before anything is written, so
// the request stays PENDING and HR can reject it with a reason (DATABASE §5.8).
async function applyApprovedCorrection(
  transaction: ICorrectionRequestDecisionTransaction,
  locked: LockedCorrectionRequest,
): Promise<number> {
  const day = await transaction.findDayForUpdate(locked.attendanceDayId);
  if (day === undefined)
    throw new Error('The attendance day of the correction request was not found.');
  if (day.revision !== locked.baseRevision) throw new AttendanceDayChangedError();

  const applied = applyCorrectionToDay({
    daySchedule: day.daySchedule,
    requestedOutcome: locked.requestedOutcome,
    requestedCheckinAt: locked.requestedCheckinAt,
    requestedCheckoutAt: locked.requestedCheckoutAt,
  });
  return transaction.applyDayValues(day.dayId, applied);
}

// A blank reason is no reason. For a rejection the rule then refuses it, and for an approval it is stored as null, so
// review_reason is never an empty string.
function normalizeReviewReason(reviewReason: string | null): string | null {
  if (reviewReason === null || reviewReason.trim().length === 0) return null;
  return reviewReason;
}
