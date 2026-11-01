import {
  isSameOvertimeSubmission,
  type OvertimeSubmission,
} from './overtime-request-submission.rules.js';

const SUBMISSION: OvertimeSubmission = {
  accountId: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13',
  businessDate: '2026-11-02',
  startAt: new Date('2026-11-02T11:00:00Z'),
  endAt: new Date('2026-11-02T13:00:00Z'),
  reason: 'Release deployment',
  idempotencyKey: '0b9e8d7c-6a5f-4e3d-8c2b-1a0f9e8d7c6b',
};

// The stored fields that a retry is compared with, taken from the submission above.
const STORED = {
  businessDate: SUBMISSION.businessDate,
  startAt: SUBMISSION.startAt,
  endAt: SUBMISSION.endAt,
  reason: SUBMISSION.reason,
};

describe('isSameOvertimeSubmission', () => {
  it.each([
    {
      condition: 'every field matches',
      submission: {},
    },
    {
      condition: 'the same instants are written with another offset',
      submission: {
        startAt: new Date('2026-11-02T18:00:00+07:00'),
        endAt: new Date('2026-11-02T20:00:00+07:00'),
      },
    },
  ])('should treat the retry as the same request when $condition', ({ submission }) => {
    expect(isSameOvertimeSubmission(STORED, { ...SUBMISSION, ...submission })).toBe(true);
  });

  it.each([
    { field: 'businessDate', submission: { businessDate: '2026-11-03' } },
    { field: 'startAt', submission: { startAt: new Date('2026-11-02T11:30:00Z') } },
    { field: 'endAt', submission: { endAt: new Date('2026-11-02T14:00:00Z') } },
    { field: 'reason', submission: { reason: 'Client demo' } },
  ])('should treat the retry as a different request when $field differs', ({ submission }) => {
    expect(isSameOvertimeSubmission(STORED, { ...SUBMISSION, ...submission })).toBe(false);
  });

  it('should ignore the requester and the key, which are the lookup itself', () => {
    const otherAccount = { ...SUBMISSION, accountId: '0b9e8d7c-6a5f-4e3d-8c2b-1a0f9e8d7c6b' };

    expect(isSameOvertimeSubmission(STORED, otherAccount)).toBe(true);
  });
});
