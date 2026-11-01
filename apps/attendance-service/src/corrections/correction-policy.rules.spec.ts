import {
  CORRECTION_SUBMISSION_WINDOW_DAYS,
  evaluateCorrectionPolicy,
  REQUESTED_CORRECTION_OUTCOME,
  type CorrectionPolicyInput,
  type CorrectionPolicyResult,
  type CorrectionPolicyViolation,
} from './correction-policy.rules.js';

const BUSINESS_TIMEZONE = 'Asia/Jakarta';
// 19:00 WIB on Monday 2026-11-02, so "today" in the business timezone is 2026-11-02.
const NOW = new Date('2026-11-02T12:00:00Z');
const BUSINESS_DATE = '2026-11-01';

const OK: CorrectionPolicyResult = { kind: 'ok' };

function violation(code: CorrectionPolicyViolation): CorrectionPolicyResult {
  return { kind: 'violation', violation: code };
}

function wibInstant(localDateTime: string): Date {
  return new Date(`${localDateTime}+07:00`);
}

type CorrectionPolicyRow = {
  readonly condition: string;
  readonly result: string;
  readonly input: Omit<CorrectionPolicyInput, 'now' | 'businessTimezone'>;
  readonly expected: CorrectionPolicyResult;
};

/** A PRESENT correction for BUSINESS_DATE with a 09:00 to 17:00 WIB punch pair. Rows override one field. */
function presentRequest(
  overrides: Partial<CorrectionPolicyRow['input']> = {},
): CorrectionPolicyRow['input'] {
  return {
    businessDate: BUSINESS_DATE,
    requestedOutcome: REQUESTED_CORRECTION_OUTCOME.PRESENT,
    requestedCheckinAt: wibInstant('2026-11-01T09:00:00'),
    requestedCheckoutAt: wibInstant('2026-11-01T17:00:00'),
    ...overrides,
  };
}

function leaveRequest(
  requestedOutcome:
    typeof REQUESTED_CORRECTION_OUTCOME.SICK_LEAVE | typeof REQUESTED_CORRECTION_OUTCOME.LEAVE,
  overrides: Partial<CorrectionPolicyRow['input']> = {},
): CorrectionPolicyRow['input'] {
  return {
    businessDate: BUSINESS_DATE,
    requestedOutcome,
    requestedCheckinAt: null,
    requestedCheckoutAt: null,
    ...overrides,
  };
}

describe('evaluateCorrectionPolicy', () => {
  it('should use a 30-day submission window', () => {
    expect(CORRECTION_SUBMISSION_WINDOW_DAYS).toBe(30);
  });

  it.each<CorrectionPolicyRow>([
    {
      condition: 'the business date is today',
      result: 'allow the request',
      input: leaveRequest(REQUESTED_CORRECTION_OUTCOME.SICK_LEAVE, { businessDate: '2026-11-02' }),
      expected: OK,
    },
    {
      condition: 'the business date is 30 days back',
      result: 'allow the request',
      input: leaveRequest(REQUESTED_CORRECTION_OUTCOME.SICK_LEAVE, { businessDate: '2026-10-03' }),
      expected: OK,
    },
    {
      condition: 'the business date is 31 days back',
      result: 'reject the request as BUSINESS_DATE_OUTSIDE_WINDOW',
      input: leaveRequest(REQUESTED_CORRECTION_OUTCOME.SICK_LEAVE, { businessDate: '2026-10-02' }),
      expected: violation('BUSINESS_DATE_OUTSIDE_WINDOW'),
    },
    {
      condition: 'the business date is tomorrow',
      result: 'reject the request as BUSINESS_DATE_OUTSIDE_WINDOW',
      input: leaveRequest(REQUESTED_CORRECTION_OUTCOME.LEAVE, { businessDate: '2026-11-03' }),
      expected: violation('BUSINESS_DATE_OUTSIDE_WINDOW'),
    },
    {
      condition: 'the outcome is Present with a clock-in only',
      result: 'allow the request',
      input: presentRequest({ requestedCheckoutAt: null }),
      expected: OK,
    },
    {
      condition: 'the clock-out is one minute after the clock-in',
      result: 'allow the request',
      input: presentRequest({
        requestedCheckinAt: wibInstant('2026-11-01T09:00:00'),
        requestedCheckoutAt: wibInstant('2026-11-01T09:01:00'),
      }),
      expected: OK,
    },
    {
      condition: 'the clock-in is exactly the current instant',
      result: 'allow the request',
      input: presentRequest({
        businessDate: '2026-11-02',
        requestedCheckinAt: wibInstant('2026-11-02T19:00:00'),
        requestedCheckoutAt: null,
      }),
      expected: OK,
    },
    {
      condition: 'the outcome is Present with no clock-in',
      result: 'reject the request as CLOCK_IN_REQUIRED',
      input: presentRequest({ requestedCheckinAt: null }),
      expected: violation('CLOCK_IN_REQUIRED'),
    },
    {
      condition: 'the clock-in is on the previous business date',
      result: 'reject the request as CLOCK_IN_OUTSIDE_BUSINESS_DATE',
      input: presentRequest({
        requestedCheckinAt: wibInstant('2026-10-31T23:00:00'),
        requestedCheckoutAt: null,
      }),
      expected: violation('CLOCK_IN_OUTSIDE_BUSINESS_DATE'),
    },
    {
      condition:
        'the clock-in is after 19:00 WIB on the business date, which is still in the future',
      result: 'reject the request as CLOCK_IN_IN_FUTURE',
      input: presentRequest({
        businessDate: '2026-11-02',
        requestedCheckinAt: wibInstant('2026-11-02T20:00:00'),
        requestedCheckoutAt: null,
      }),
      expected: violation('CLOCK_IN_IN_FUTURE'),
    },
    {
      condition: 'the clock-out is on the next business date',
      result: 'reject the request as CLOCK_OUT_OUTSIDE_BUSINESS_DATE',
      input: presentRequest({
        requestedCheckinAt: wibInstant('2026-11-01T09:00:00'),
        requestedCheckoutAt: wibInstant('2026-11-02T01:00:00'),
      }),
      expected: violation('CLOCK_OUT_OUTSIDE_BUSINESS_DATE'),
    },
    {
      condition:
        'the clock-out is after 19:00 WIB on the business date, which is still in the future',
      result: 'reject the request as CLOCK_OUT_IN_FUTURE',
      input: presentRequest({
        businessDate: '2026-11-02',
        requestedCheckinAt: wibInstant('2026-11-02T09:00:00'),
        requestedCheckoutAt: wibInstant('2026-11-02T20:00:00'),
      }),
      expected: violation('CLOCK_OUT_IN_FUTURE'),
    },
    {
      condition: 'the clock-out is equal to the clock-in',
      result: 'reject the request as CLOCK_OUT_NOT_AFTER_CLOCK_IN',
      input: presentRequest({
        requestedCheckinAt: wibInstant('2026-11-01T09:00:00'),
        requestedCheckoutAt: wibInstant('2026-11-01T09:00:00'),
      }),
      expected: violation('CLOCK_OUT_NOT_AFTER_CLOCK_IN'),
    },
    {
      condition: 'the clock-out is before the clock-in on the same business date',
      result: 'reject the request as CLOCK_OUT_NOT_AFTER_CLOCK_IN',
      input: presentRequest({
        requestedCheckinAt: wibInstant('2026-11-01T10:00:00'),
        requestedCheckoutAt: wibInstant('2026-11-01T09:00:00'),
      }),
      expected: violation('CLOCK_OUT_NOT_AFTER_CLOCK_IN'),
    },
    {
      condition: 'the outcome is Sick leave with a clock-in time',
      result: 'reject the request as TIMES_NOT_ALLOWED_FOR_LEAVE',
      input: leaveRequest(REQUESTED_CORRECTION_OUTCOME.SICK_LEAVE, {
        requestedCheckinAt: wibInstant('2026-11-01T09:00:00'),
      }),
      expected: violation('TIMES_NOT_ALLOWED_FOR_LEAVE'),
    },
    {
      condition: 'the outcome is Leave with only a clock-out time',
      result: 'reject the request as TIMES_NOT_ALLOWED_FOR_LEAVE',
      input: leaveRequest(REQUESTED_CORRECTION_OUTCOME.LEAVE, {
        requestedCheckoutAt: wibInstant('2026-11-01T17:00:00'),
      }),
      expected: violation('TIMES_NOT_ALLOWED_FOR_LEAVE'),
    },
    {
      condition: 'the outcome is Sick leave with both times null',
      result: 'allow the request',
      input: leaveRequest(REQUESTED_CORRECTION_OUTCOME.SICK_LEAVE),
      expected: OK,
    },
    {
      condition: 'the outcome is Leave with both times null',
      result: 'allow the request',
      input: leaveRequest(REQUESTED_CORRECTION_OUTCOME.LEAVE),
      expected: OK,
    },
  ])('should $result when $condition', ({ input, expected }) => {
    const result = evaluateCorrectionPolicy({
      ...input,
      now: NOW,
      businessTimezone: BUSINESS_TIMEZONE,
    });

    expect(result).toEqual(expected);
  });
});
