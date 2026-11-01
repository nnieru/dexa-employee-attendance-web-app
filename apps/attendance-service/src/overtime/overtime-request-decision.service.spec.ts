import type { IClock } from '@dexa/common';
import { ErrorCode } from '@dexa/contracts';
import type { IOutboxWriter } from '@dexa/messaging';
import { RequestNotFoundError } from '../requests/request-decision.errors.js';
import type {
  IOvertimeRequestDecisionRepository,
  IOvertimeRequestDecisionTransaction,
  LockedOvertimeRequest,
  NewRequestDecision,
} from './overtime-request-decision.repository.interface.js';
import { OvertimeRequestDecisionService } from './overtime-request-decision.service.js';

const REQUESTER_ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
const HR_ACCOUNT_ID = '9d2b6a1e-3c4f-4a8b-8e7d-1f2a3b4c5d6e';
const REQUEST_ID = '0b9e8d7c-6a5f-4e3d-8c2b-1a0f9e8d7c6b';
const REVIEW_MOMENT = new Date('2026-11-06T03:00:00Z');
const PENDING_REQUEST: LockedOvertimeRequest = {
  id: REQUEST_ID,
  businessDate: '2026-11-02',
  startAt: new Date('2026-11-02T11:00:00Z'),
  endAt: new Date('2026-11-02T13:00:00Z'),
  reason: 'Release deployment',
  status: 'PENDING',
  reviewReason: null,
  reviewedAt: null,
  createdAt: new Date('2026-11-02T10:00:00Z'),
  requesterAccountId: REQUESTER_ACCOUNT_ID,
};

// A fake that behaves like the Drizzle repository for these calls: it returns the stored row or undefined, and it
// records every decision written. It answers the same way for a missing request as the database does.
class FakeDecisionRepository implements IOvertimeRequestDecisionRepository {
  readonly writes: NewRequestDecision[] = [];
  private stored: LockedOvertimeRequest | undefined;

  constructor(stored: LockedOvertimeRequest | undefined) {
    this.stored = stored;
  }

  runInTransaction<TResult>(
    work: (transaction: IOvertimeRequestDecisionTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    const transaction: IOvertimeRequestDecisionTransaction = {
      insert: () => ({ values: () => Promise.resolve() }),
      findRequestForUpdate: (requestId) =>
        Promise.resolve(this.stored?.id === requestId ? this.stored : undefined),
      recordDecision: (decision) => {
        this.writes.push(decision);
        return Promise.resolve();
      },
    };
    return work(transaction);
  }
}

const FIXED_CLOCK: IClock = { now: () => new Date(REVIEW_MOMENT) };
const FAKE_OUTBOX: IOutboxWriter = { add: () => Promise.resolve() };

function createService(stored: LockedOvertimeRequest | undefined): {
  service: OvertimeRequestDecisionService;
  repository: FakeDecisionRepository;
} {
  const repository = new FakeDecisionRepository(stored);
  return {
    service: new OvertimeRequestDecisionService(repository, FAKE_OUTBOX, FIXED_CLOCK),
    repository,
  };
}

describe('OvertimeRequestDecisionService', () => {
  it('should record an approval with the reviewer, the clock instant, and no reason when the reason is blank', async () => {
    const { service, repository } = createService(PENDING_REQUEST);

    const decided = await service.approve(HR_ACCOUNT_ID, REQUEST_ID, { reviewReason: '   ' });

    expect(repository.writes).toEqual([
      {
        requestId: REQUEST_ID,
        status: 'APPROVED',
        reviewerAccountId: HR_ACCOUNT_ID,
        reviewedAt: REVIEW_MOMENT,
        reviewReason: null,
      },
    ]);
    expect(decided).toMatchObject({
      status: 'APPROVED',
      reviewReason: null,
      reviewedAt: REVIEW_MOMENT.toISOString(),
    });
  });

  it('should refuse a rejection with a blank reason and write nothing', async () => {
    const { service, repository } = createService(PENDING_REQUEST);

    await expect(
      service.reject(HR_ACCOUNT_ID, REQUEST_ID, { reviewReason: '   ' }),
    ).rejects.toMatchObject({ code: ErrorCode.REVIEW_REASON_REQUIRED });
    expect(repository.writes).toEqual([]);
  });

  it('should refuse a reviewer who is the requester and write nothing', async () => {
    const { service, repository } = createService(PENDING_REQUEST);

    await expect(service.approve(REQUESTER_ACCOUNT_ID, REQUEST_ID, {})).rejects.toMatchObject({
      code: ErrorCode.SELF_REVIEW_FORBIDDEN,
    });
    expect(repository.writes).toEqual([]);
  });

  it('should return the recorded request and write nothing when the same decision is repeated', async () => {
    const approved: LockedOvertimeRequest = {
      ...PENDING_REQUEST,
      status: 'APPROVED',
      reviewReason: 'Confirmed',
      reviewedAt: new Date('2026-11-05T01:00:00Z'),
    };
    const { service, repository } = createService(approved);

    const replayed = await service.approve(HR_ACCOUNT_ID, REQUEST_ID, {});

    expect(repository.writes).toEqual([]);
    expect(replayed).toMatchObject({
      status: 'APPROVED',
      reviewReason: 'Confirmed',
      reviewedAt: '2026-11-05T01:00:00.000Z',
    });
  });

  it('should refuse a different decision on a decided request and write nothing', async () => {
    const rejected: LockedOvertimeRequest = {
      ...PENDING_REQUEST,
      status: 'REJECTED',
      reviewReason: 'Overlaps release',
      reviewedAt: new Date('2026-11-05T01:00:00Z'),
    };
    const { service, repository } = createService(rejected);

    await expect(service.approve(HR_ACCOUNT_ID, REQUEST_ID, {})).rejects.toMatchObject({
      code: ErrorCode.REQUEST_ALREADY_DECIDED,
    });
    expect(repository.writes).toEqual([]);
  });

  it('should refuse an unknown request with RequestNotFoundError and write nothing', async () => {
    const { service, repository } = createService(undefined);

    await expect(service.approve(HR_ACCOUNT_ID, REQUEST_ID, {})).rejects.toBeInstanceOf(
      RequestNotFoundError,
    );
    expect(repository.writes).toEqual([]);
  });
});
