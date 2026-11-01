import {
  isSameCorrectionSubmission,
  type CorrectionSubmission,
  type StoredCorrectionSubmission,
} from './correction-request-submission.rules.js';

const CHECKIN = new Date('2026-11-02T02:05:00Z');
const CHECKOUT = new Date('2026-11-02T11:00:00Z');

const SUBMISSION: CorrectionSubmission = {
  accountId: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13',
  businessDate: '2026-11-02',
  requestedOutcome: 'PRESENT',
  requestedCheckinAt: CHECKIN,
  requestedCheckoutAt: CHECKOUT,
  reason: 'Forgot to clock in',
  idempotencyKey: '0b9e8d7c-6a5f-4e3d-8c2b-1a0f9e8d7c6b',
};

// The stored fields that a retry is compared with, taken from the submission above.
const STORED: StoredCorrectionSubmission = {
  businessDate: SUBMISSION.businessDate,
  requestedOutcome: SUBMISSION.requestedOutcome,
  requestedCheckinAt: CHECKIN,
  requestedCheckoutAt: CHECKOUT,
  reason: SUBMISSION.reason,
};

describe('isSameCorrectionSubmission', () => {
  it.each([
    { condition: 'every field matches', override: {} },
    {
      condition: 'the same instants are written with another offset',
      override: { requestedCheckinAt: new Date('2026-11-02T09:05:00+07:00') },
    },
  ])('should return true when $condition', ({ override }) => {
    expect(isSameCorrectionSubmission(STORED, { ...SUBMISSION, ...override })).toBe(true);
  });

  it.each([
    { condition: 'the outcome differs', override: { requestedOutcome: 'LEAVE' as const } },
    {
      condition: 'the clock-in differs',
      override: { requestedCheckinAt: new Date('2026-11-02T03:00:00Z') },
    },
    { condition: 'the clock-out is removed', override: { requestedCheckoutAt: null } },
    { condition: 'the reason differs', override: { reason: 'Different reason' } },
    { condition: 'the business date differs', override: { businessDate: '2026-11-03' as const } },
  ])('should return false when $condition', ({ override }) => {
    expect(isSameCorrectionSubmission(STORED, { ...SUBMISSION, ...override })).toBe(false);
  });

  it('should return true for two leave submissions with no times', () => {
    const storedLeave: StoredCorrectionSubmission = {
      ...STORED,
      requestedOutcome: 'SICK_LEAVE',
      requestedCheckinAt: null,
      requestedCheckoutAt: null,
    };
    const leave: CorrectionSubmission = {
      ...SUBMISSION,
      requestedOutcome: 'SICK_LEAVE',
      requestedCheckinAt: null,
      requestedCheckoutAt: null,
    };

    expect(isSameCorrectionSubmission(storedLeave, leave)).toBe(true);
  });
});
