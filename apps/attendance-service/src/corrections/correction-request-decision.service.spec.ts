import type { IClock } from '@dexa/common';
import { ErrorCode } from '@dexa/contracts';
import { RequestNotFoundError } from '../requests/request-decision.errors.js';
import { AttendanceDayChangedError } from './correction-request.errors.js';
import type { DaySchedule } from '../classification/punch-classification.rules.js';
import type { AppliedCorrectionDay } from './correction-apply.rules.js';
import type {
  ICorrectionRequestDecisionRepository,
  ICorrectionRequestDecisionTransaction,
  LockedCorrectionDay,
  LockedCorrectionRequest,
  NewRequestDecision,
} from './correction-request-decision.repository.interface.js';
import { CorrectionRequestDecisionService } from './correction-request-decision.service.js';

const REQUESTER_ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
const HR_ACCOUNT_ID = '9d2b6a1e-3c4f-4a8b-8e7d-1f2a3b4c5d6e';
const REQUEST_ID = '0b9e8d7c-6a5f-4e3d-8c2b-1a0f9e8d7c6b';
const DAY_ID = '7a1c2e3f-4b5d-4e6f-8a9b-0c1d2e3f4a5b';
const REVIEW_MOMENT = new Date('2026-11-06T03:00:00Z');
const WORKING_DAY: DaySchedule = {
  isWorkingDay: true,
  timezone: 'Asia/Jakarta',
  scheduledStartAt: new Date('2026-11-03T02:00:00Z'),
  scheduledEndAt: new Date('2026-11-03T11:00:00Z'),
  lateCheckinGraceMinutes: 15,
  earlyCheckoutGraceMinutes: 0,
  lateCheckoutGraceMinutes: 0,
};

function pendingPresentRequest(baseRevision: number): LockedCorrectionRequest {
  return {
    id: REQUEST_ID,
    businessDate: '2026-11-03',
    requestedOutcome: 'PRESENT',
    requestedCheckinAt: new Date('2026-11-03T01:55:00Z'),
    requestedCheckoutAt: new Date('2026-11-03T11:00:00Z'),
    reason: 'Forgot to clock in',
    status: 'PENDING',
    reviewReason: null,
    reviewedAt: null,
    createdAt: new Date('2026-11-04T03:00:00Z'),
    requesterAccountId: REQUESTER_ACCOUNT_ID,
    attendanceDayId: DAY_ID,
    baseRevision,
  };
}

// A fake that behaves like the Drizzle repository for these calls. It returns the stored rows or undefined, records the
// order of the locks, and records every write, so a test can check what was written and what was not.
class FakeDecisionRepository implements ICorrectionRequestDecisionRepository {
  readonly locks: string[] = [];
  readonly dayWrites: AppliedCorrectionDay[] = [];
  readonly decisionWrites: NewRequestDecision[] = [];
  private request: LockedCorrectionRequest | undefined;
  private day: LockedCorrectionDay | undefined;

  constructor(request: LockedCorrectionRequest | undefined, day: LockedCorrectionDay | undefined) {
    this.request = request;
    this.day = day;
  }

  runInTransaction<TResult>(
    work: (transaction: ICorrectionRequestDecisionTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    const transaction: ICorrectionRequestDecisionTransaction = {
      findRequestForUpdate: (requestId) => {
        this.locks.push('request');
        return Promise.resolve(this.request?.id === requestId ? this.request : undefined);
      },
      findDayForUpdate: (attendanceDayId) => {
        this.locks.push('day');
        return Promise.resolve(this.day?.dayId === attendanceDayId ? this.day : undefined);
      },
      applyDayValues: (_dayId, values) => {
        this.dayWrites.push(values);
        const revision = (this.day?.revision ?? 0) + 1;
        if (this.day !== undefined) this.day = { ...this.day, revision };
        return Promise.resolve(revision);
      },
      recordDecision: (decision) => {
        this.decisionWrites.push(decision);
        return Promise.resolve();
      },
    };
    return work(transaction);
  }
}

const FIXED_CLOCK: IClock = { now: () => new Date(REVIEW_MOMENT) };

function createService(
  request: LockedCorrectionRequest | undefined,
  day: LockedCorrectionDay | undefined = { dayId: DAY_ID, revision: 2, daySchedule: WORKING_DAY },
): { service: CorrectionRequestDecisionService; repository: FakeDecisionRepository } {
  const repository = new FakeDecisionRepository(request, day);
  return { service: new CorrectionRequestDecisionService(repository, FIXED_CLOCK), repository };
}

describe('CorrectionRequestDecisionService', () => {
  it('should apply an approval to the day, record the applied revision, and lock the request before the day', async () => {
    const { service, repository } = createService(pendingPresentRequest(2));

    const decided = await service.approve(HR_ACCOUNT_ID, REQUEST_ID, {
      reviewReason: 'Checked',
    });

    expect(repository.locks).toEqual(['request', 'day']);
    expect(repository.dayWrites).toEqual([
      {
        dayStatusCode: 'PRESENT',
        effectiveCheckinAt: new Date('2026-11-03T01:55:00Z'),
        effectiveCheckoutAt: new Date('2026-11-03T11:00:00Z'),
        checkinStatusCode: 'EARLY_CHECKIN',
        checkoutStatusCode: 'ON_TIME_CHECKOUT',
      },
    ]);
    expect(repository.decisionWrites).toEqual([
      {
        requestId: REQUEST_ID,
        status: 'APPROVED',
        reviewerAccountId: HR_ACCOUNT_ID,
        reviewedAt: REVIEW_MOMENT,
        reviewReason: 'Checked',
        appliedRevision: 3,
      },
    ]);
    expect(decided).toMatchObject({
      id: REQUEST_ID,
      status: 'APPROVED',
      reviewReason: 'Checked',
      reviewedAt: REVIEW_MOMENT.toISOString(),
      clockInAt: '2026-11-03T01:55:00.000Z',
    });
  });

  it('should store no approval reason when the reason is blank', async () => {
    const { service, repository } = createService(pendingPresentRequest(2));

    const decided = await service.approve(HR_ACCOUNT_ID, REQUEST_ID, { reviewReason: '   ' });

    expect(repository.decisionWrites[0]?.reviewReason).toBeNull();
    expect(decided.reviewReason).toBeNull();
  });

  it('should refuse an approval when the day changed since submission and write nothing', async () => {
    const { service, repository } = createService(pendingPresentRequest(1), {
      dayId: DAY_ID,
      revision: 2,
      daySchedule: WORKING_DAY,
    });

    await expect(service.approve(HR_ACCOUNT_ID, REQUEST_ID, {})).rejects.toBeInstanceOf(
      AttendanceDayChangedError,
    );
    expect(repository.dayWrites).toEqual([]);
    expect(repository.decisionWrites).toEqual([]);
  });

  it('should reject a stale request without locking or changing the day', async () => {
    const { service, repository } = createService(pendingPresentRequest(1), {
      dayId: DAY_ID,
      revision: 5,
      daySchedule: WORKING_DAY,
    });

    const decided = await service.reject(HR_ACCOUNT_ID, REQUEST_ID, {
      reviewReason: 'Clock records differ',
    });

    expect(repository.locks).toEqual(['request']);
    expect(repository.dayWrites).toEqual([]);
    expect(repository.decisionWrites).toEqual([
      {
        requestId: REQUEST_ID,
        status: 'REJECTED',
        reviewerAccountId: HR_ACCOUNT_ID,
        reviewedAt: REVIEW_MOMENT,
        reviewReason: 'Clock records differ',
        appliedRevision: null,
      },
    ]);
    expect(decided).toMatchObject({ status: 'REJECTED', reviewReason: 'Clock records differ' });
  });

  it('should refuse a rejection with a blank reason and write nothing', async () => {
    const { service, repository } = createService(pendingPresentRequest(2));

    await expect(
      service.reject(HR_ACCOUNT_ID, REQUEST_ID, { reviewReason: '   ' }),
    ).rejects.toMatchObject({ code: ErrorCode.REVIEW_REASON_REQUIRED });
    expect(repository.decisionWrites).toEqual([]);
  });

  it('should refuse a reviewer who is the requester and write nothing', async () => {
    const { service, repository } = createService(pendingPresentRequest(2));

    await expect(service.approve(REQUESTER_ACCOUNT_ID, REQUEST_ID, {})).rejects.toMatchObject({
      code: ErrorCode.SELF_REVIEW_FORBIDDEN,
    });
    expect(repository.locks).toEqual(['request']);
    expect(repository.decisionWrites).toEqual([]);
  });

  it('should return the recorded request and write nothing when the same approval is repeated', async () => {
    const approved: LockedCorrectionRequest = {
      ...pendingPresentRequest(2),
      status: 'APPROVED',
      reviewReason: 'Checked',
      reviewedAt: new Date('2026-11-05T01:00:00Z'),
    };
    const { service, repository } = createService(approved);

    const replayed = await service.approve(HR_ACCOUNT_ID, REQUEST_ID, {});

    expect(repository.locks).toEqual(['request']);
    expect(repository.dayWrites).toEqual([]);
    expect(repository.decisionWrites).toEqual([]);
    expect(replayed).toMatchObject({
      status: 'APPROVED',
      reviewReason: 'Checked',
      reviewedAt: '2026-11-05T01:00:00.000Z',
    });
  });

  it('should refuse a different decision on a decided request and write nothing', async () => {
    const approved: LockedCorrectionRequest = {
      ...pendingPresentRequest(2),
      status: 'APPROVED',
      reviewedAt: new Date('2026-11-05T01:00:00Z'),
    };
    const { service, repository } = createService(approved);

    await expect(
      service.reject(HR_ACCOUNT_ID, REQUEST_ID, { reviewReason: 'Changed my mind' }),
    ).rejects.toMatchObject({ code: ErrorCode.REQUEST_ALREADY_DECIDED });
    expect(repository.dayWrites).toEqual([]);
    expect(repository.decisionWrites).toEqual([]);
  });

  it('should refuse an unknown request with RequestNotFoundError and write nothing', async () => {
    const { service, repository } = createService(undefined);

    await expect(service.approve(HR_ACCOUNT_ID, REQUEST_ID, {})).rejects.toBeInstanceOf(
      RequestNotFoundError,
    );
    expect(repository.decisionWrites).toEqual([]);
  });
});
