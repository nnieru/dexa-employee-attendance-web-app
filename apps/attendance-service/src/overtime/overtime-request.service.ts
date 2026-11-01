import { CLOCK, type IClock } from '@dexa/common';
import { EventName, type SubmitOvertimeRequest } from '@dexa/contracts';
import { OUTBOX_WRITER, type IOutboxWriter } from '@dexa/messaging';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CONFIG } from '../config/config.token.js';
import type { AttendanceServiceConfig } from '../config/attendance-service-config.schema.js';
import { findOrCreateAttendanceDayForUpdate } from '../attendance-days/find-or-create-attendance-day.js';
import {
  IdempotencyKeyConflictError,
  OvertimeIdempotencyKeyRaceError,
  OvertimePolicyViolationError,
} from './overtime-request.errors.js';
import {
  OVERTIME_REQUEST_REPOSITORY,
  type IOvertimeRequestRepository,
  type IOvertimeRequestTransaction,
  type StoredOvertimeRequest,
} from './overtime-request.repository.interface.js';
import {
  isSameOvertimeSubmission,
  type OvertimeSubmission,
} from './overtime-request-submission.rules.js';
import { evaluateOvertimePolicy } from './overtime-policy.rules.js';
import { toOvertimeRequest } from './overtime-request.rules.js';
import type {
  IOvertimeRequestService,
  SubmitOvertimeRequestResult,
} from './overtime-request.service.interface.js';
import { buildAttendanceRequestEvent } from '../requests/attendance-request-event.rules.js';

type SubmissionMoment = {
  readonly submission: OvertimeSubmission;
  readonly submittedAt: Date;
  readonly businessTimezone: string;
};

type StoredSubmission = {
  readonly created: boolean;
  readonly request: StoredOvertimeRequest;
};

@Injectable()
export class OvertimeRequestService implements IOvertimeRequestService {
  constructor(
    @Inject(OVERTIME_REQUEST_REPOSITORY)
    private readonly overtimeRequests: IOvertimeRequestRepository,
    @Inject(OUTBOX_WRITER) private readonly outbox: IOutboxWriter,
    @Inject(CLOCK) private readonly clock: IClock,
    @Inject(CONFIG) private readonly config: Pick<AttendanceServiceConfig, 'BUSINESS_TIMEZONE'>,
  ) {}

  // The instant is read once, so the window check is judged at one moment, including on the single retry below.
  async submit(
    accountId: string,
    request: SubmitOvertimeRequest,
  ): Promise<SubmitOvertimeRequestResult> {
    const moment: SubmissionMoment = {
      submission: toSubmission(accountId, request),
      submittedAt: this.clock.now(),
      businessTimezone: this.config.BUSINESS_TIMEZONE,
    };
    const stored = await this.submitOnce(moment).catch((error: unknown) => {
      if (!(error instanceof OvertimeIdempotencyKeyRaceError)) throw error;
      // The concurrent submission committed the key, so this retry finds that request and judges this one against it.
      return this.submitOnce(moment);
    });
    return { created: stored.created, request: toOvertimeRequest(stored.request) };
  }

  private submitOnce(moment: SubmissionMoment): Promise<StoredSubmission> {
    return this.overtimeRequests.runInTransaction((transaction) =>
      this.submitInTransaction(transaction, moment),
    );
  }

  // Order matters: the day is locked first, so the idempotency lookup and the minute sum see every committed
  // submission for this day. A retry is answered before the policy runs, so it is not refused by a rule that changed later.
  private async submitInTransaction(
    transaction: IOvertimeRequestTransaction,
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

    const existingActiveMinutes = await transaction.findActiveOvertimeMinutes(day.dayId);
    const policy = evaluateOvertimePolicy({
      now: submittedAt,
      businessTimezone,
      businessDate: submission.businessDate,
      startAt: submission.startAt,
      endAt: submission.endAt,
      daySchedule: day.daySchedule,
      existingActiveMinutes,
    });
    if (policy.kind === 'violation') throw new OvertimePolicyViolationError(policy.violation);

    const inserted = await transaction.insertOvertimeRequest({
      attendanceDayId: day.dayId,
      accountId: submission.accountId,
      businessDate: submission.businessDate,
      startAt: submission.startAt,
      endAt: submission.endAt,
      reason: submission.reason,
      idempotencyKey: submission.idempotencyKey,
    });
    await this.stageSubmittedEvent(transaction, moment, inserted);
    return { created: true, request: inserted };
  }

  // The event joins the transaction, so it is stored only with the request it reports. A replay returns before this runs.
  private stageSubmittedEvent(
    transaction: IOvertimeRequestTransaction,
    moment: SubmissionMoment,
    request: StoredOvertimeRequest,
  ): Promise<void> {
    return this.outbox.add(
      transaction,
      buildAttendanceRequestEvent({
        eventId: randomUUID(),
        eventType: EventName.ATTENDANCE_REQUEST_SUBMITTED,
        occurredAt: moment.submittedAt,
        accountId: moment.submission.accountId,
        actorAccountId: moment.submission.accountId,
        resourceType: 'overtime_request',
        resourceId: request.id,
        businessDate: moment.submission.businessDate,
      }),
    );
  }
}

function replayOrRefuse(
  stored: StoredOvertimeRequest,
  submission: OvertimeSubmission,
): StoredSubmission {
  if (!isSameOvertimeSubmission(stored, submission)) throw new IdempotencyKeyConflictError();
  return { created: false, request: stored };
}

function toSubmission(accountId: string, request: SubmitOvertimeRequest): OvertimeSubmission {
  return {
    accountId,
    businessDate: request.businessDate,
    startAt: new Date(request.startAt),
    endAt: new Date(request.endAt),
    reason: request.reason,
    idempotencyKey: request.idempotencyKey,
  };
}
