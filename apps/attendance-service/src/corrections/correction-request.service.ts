import { CLOCK, type IClock } from '@dexa/common';
import { EventName, type SubmitCorrectionRequest } from '@dexa/contracts';
import { OUTBOX_WRITER, type IOutboxWriter } from '@dexa/messaging';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CONFIG } from '../config/config.token.js';
import type { AttendanceServiceConfig } from '../config/attendance-service-config.schema.js';
import { findOrCreateAttendanceDayForUpdate } from '../attendance-days/find-or-create-attendance-day.js';
import { IdempotencyKeyConflictError } from '../overtime/overtime-request.errors.js';
import {
  CorrectionAlreadyPendingError,
  CorrectionIdempotencyKeyRaceError,
  CorrectionPolicyViolationError,
} from './correction-request.errors.js';
import {
  CORRECTION_REQUEST_REPOSITORY,
  type ICorrectionRequestRepository,
  type ICorrectionRequestTransaction,
  type StoredCorrectionRequest,
} from './correction-request.repository.interface.js';
import {
  isSameCorrectionSubmission,
  type CorrectionSubmission,
} from './correction-request-submission.rules.js';
import { evaluateCorrectionPolicy } from './correction-policy.rules.js';
import { toCorrectionRequest } from './correction-request.rules.js';
import type {
  ICorrectionRequestService,
  SubmitCorrectionRequestResult,
} from './correction-request.service.interface.js';
import { buildAttendanceRequestEvent } from '../requests/attendance-request-event.rules.js';

type SubmissionMoment = {
  readonly submission: CorrectionSubmission;
  readonly submittedAt: Date;
  readonly businessTimezone: string;
};

type StoredSubmission = {
  readonly created: boolean;
  readonly request: StoredCorrectionRequest;
};

@Injectable()
export class CorrectionRequestService implements ICorrectionRequestService {
  constructor(
    @Inject(CORRECTION_REQUEST_REPOSITORY)
    private readonly correctionRequests: ICorrectionRequestRepository,
    @Inject(OUTBOX_WRITER) private readonly outbox: IOutboxWriter,
    @Inject(CLOCK) private readonly clock: IClock,
    @Inject(CONFIG) private readonly config: Pick<AttendanceServiceConfig, 'BUSINESS_TIMEZONE'>,
  ) {}

  // The instant is read once, so the window and future checks are judged at one moment, including on the retry below.
  async submit(
    accountId: string,
    request: SubmitCorrectionRequest,
  ): Promise<SubmitCorrectionRequestResult> {
    const moment: SubmissionMoment = {
      submission: toSubmission(accountId, request),
      submittedAt: this.clock.now(),
      businessTimezone: this.config.BUSINESS_TIMEZONE,
    };
    const stored = await this.submitOnce(moment).catch((error: unknown) => {
      if (!(error instanceof CorrectionIdempotencyKeyRaceError)) throw error;
      // The concurrent submission committed the key, so this retry finds that request and judges this one against it.
      return this.submitOnce(moment);
    });
    return { created: stored.created, request: toCorrectionRequest(stored.request) };
  }

  private submitOnce(moment: SubmissionMoment): Promise<StoredSubmission> {
    return this.correctionRequests.runInTransaction((transaction) =>
      this.submitInTransaction(transaction, moment),
    );
  }

  // Order matters: the day is locked first, so the idempotency lookup and the pending check see every committed
  // submission for this day. A retry is answered before the policy runs, so it is not refused by a rule that changed later.
  private async submitInTransaction(
    transaction: ICorrectionRequestTransaction,
    moment: SubmissionMoment,
  ): Promise<StoredSubmission> {
    const { submission, submittedAt, businessTimezone } = moment;
    const day = await findOrCreateAttendanceDayForUpdate(transaction, {
      accountId: submission.accountId,
      businessDate: submission.businessDate,
      opening: 'REQUEST',
    });

    const stored = await transaction.findRequestByIdempotencyKey(
      submission.accountId,
      submission.idempotencyKey,
    );
    if (stored !== undefined) return replayOrRefuse(stored, submission);

    const policy = evaluateCorrectionPolicy({
      now: submittedAt,
      businessTimezone,
      businessDate: submission.businessDate,
      requestedOutcome: submission.requestedOutcome,
      requestedCheckinAt: submission.requestedCheckinAt,
      requestedCheckoutAt: submission.requestedCheckoutAt,
    });
    if (policy.kind === 'violation') throw new CorrectionPolicyViolationError(policy.violation);
    if (await transaction.hasPendingCorrection(day.dayId))
      throw new CorrectionAlreadyPendingError();

    // The snapshot is read under the day lock, so the revision HR later checks against is the one this request saw.
    const beforeDay = await transaction.findDayRevisionSnapshot(day.dayId);
    const inserted = await transaction.insertCorrectionRequest({
      attendanceDayId: day.dayId,
      accountId: submission.accountId,
      businessDate: submission.businessDate,
      requestedOutcome: submission.requestedOutcome,
      requestedCheckinAt: submission.requestedCheckinAt,
      requestedCheckoutAt: submission.requestedCheckoutAt,
      reason: submission.reason,
      idempotencyKey: submission.idempotencyKey,
      beforeDay,
    });
    await this.stageSubmittedEvent(transaction, moment, inserted);
    return { created: true, request: inserted };
  }

  // The event joins the transaction, so it is stored only with the request it reports. A replay returns before this runs.
  private stageSubmittedEvent(
    transaction: ICorrectionRequestTransaction,
    moment: SubmissionMoment,
    request: StoredCorrectionRequest,
  ): Promise<void> {
    return this.outbox.add(
      transaction,
      buildAttendanceRequestEvent({
        eventId: randomUUID(),
        eventType: EventName.ATTENDANCE_REQUEST_SUBMITTED,
        occurredAt: moment.submittedAt,
        accountId: moment.submission.accountId,
        actorAccountId: moment.submission.accountId,
        resourceType: 'attendance_adjustment_request',
        resourceId: request.id,
        businessDate: moment.submission.businessDate,
      }),
    );
  }
}

function replayOrRefuse(
  stored: StoredCorrectionRequest,
  submission: CorrectionSubmission,
): StoredSubmission {
  if (!isSameCorrectionSubmission(stored, submission)) throw new IdempotencyKeyConflictError();
  return { created: false, request: stored };
}

// The contract's union gives each outcome only its own fields, so a leave outcome has no times here.
function toSubmission(accountId: string, request: SubmitCorrectionRequest): CorrectionSubmission {
  const common = {
    accountId,
    businessDate: request.businessDate,
    reason: request.reason,
    idempotencyKey: request.idempotencyKey,
  };
  if (request.requestedDayStatus === 'PRESENT') {
    return {
      ...common,
      requestedOutcome: 'PRESENT',
      requestedCheckinAt: new Date(request.clockInAt),
      requestedCheckoutAt: request.clockOutAt === undefined ? null : new Date(request.clockOutAt),
    };
  }
  return {
    ...common,
    requestedOutcome: request.requestedDayStatus,
    requestedCheckinAt: null,
    requestedCheckoutAt: null,
  };
}
