import { describe, expect, it } from 'vitest';
import { REQUEST_REASON_MAX_LENGTH, submitCorrectionRequestSchema } from '@dexa/contracts';
import {
  CORRECTION_FORM_MESSAGES,
  createCorrectionRequestFormSchema,
  toCorrectionRequestPayload,
  type CorrectionRequestFormValues,
} from './correction-request-form.schema.js';

const TODAY = '2026-11-02';
const SCHEMA = createCorrectionRequestFormSchema(TODAY);
const KEY = '3c1f7e2a-9d4b-4a6e-8f0c-5b2d1e9a7c01';

const PRESENT_VALUES: CorrectionRequestFormValues = {
  requestedDayStatus: 'PRESENT',
  businessDate: TODAY,
  clockInTime: '09:00',
  clockOutTime: '',
  reason: 'Forgot to clock in',
};

function withValues(overrides: Partial<CorrectionRequestFormValues>): CorrectionRequestFormValues {
  return { ...PRESENT_VALUES, ...overrides };
}

describe('correction request form schema', () => {
  it.each([
    [
      'a present day with no clock-in',
      withValues({ clockInTime: '' }),
      'clockInTime',
      CORRECTION_FORM_MESSAGES.clockInRequired,
    ],
    [
      'a clock-out equal to the clock-in',
      withValues({ clockOutTime: '09:00' }),
      'clockOutTime',
      CORRECTION_FORM_MESSAGES.clockOutNotAfterClockIn,
    ],
    [
      'a clock-out before the clock-in',
      withValues({ clockOutTime: '08:30' }),
      'clockOutTime',
      CORRECTION_FORM_MESSAGES.clockOutNotAfterClockIn,
    ],
    [
      'a reason that is only spaces',
      withValues({ reason: '   ' }),
      'reason',
      CORRECTION_FORM_MESSAGES.reasonRequired,
    ],
    [
      'a reason of 501 characters',
      withValues({ reason: 'x'.repeat(REQUEST_REASON_MAX_LENGTH + 1) }),
      'reason',
      CORRECTION_FORM_MESSAGES.reasonTooLong,
    ],
    [
      'a business date 31 days back',
      withValues({ businessDate: '2026-10-02' }),
      'businessDate',
      CORRECTION_FORM_MESSAGES.businessDateOutsideWindow,
    ],
    [
      'a business date after today',
      withValues({ businessDate: '2026-11-03' }),
      'businessDate',
      CORRECTION_FORM_MESSAGES.businessDateOutsideWindow,
    ],
    [
      'an empty business date',
      withValues({ businessDate: '' }),
      'businessDate',
      CORRECTION_FORM_MESSAGES.businessDateRequired,
    ],
  ])('should refuse %s with a message on %s', (_description, values, field, message) => {
    const result = SCHEMA.safeParse(values);

    expect(result.success).toBe(false);
    const issue = result.error?.issues.find((candidate) => candidate.path[0] === field);
    expect(issue?.message).toBe(message);
  });

  it.each([
    ['a present day with a clock-in only', withValues({})],
    [
      'a present day with a clock-out later than the clock-in',
      withValues({ clockOutTime: '17:30' }),
    ],
    ['a reason of exactly 500 characters', withValues({ reason: 'x'.repeat(500) })],
    ['the oldest selectable date, 30 days back', withValues({ businessDate: '2026-10-03' })],
    ['today', withValues({ businessDate: TODAY })],
    [
      'a sick leave day with no times',
      withValues({ requestedDayStatus: 'SICK_LEAVE', clockInTime: '', clockOutTime: '' }),
    ],
    [
      'a leave day with times typed before the outcome changed',
      withValues({ requestedDayStatus: 'LEAVE', clockInTime: '08:00', clockOutTime: '07:00' }),
    ],
  ])('should accept %s', (_description, values) => {
    expect(SCHEMA.safeParse(values).success).toBe(true);
  });
});

describe('toCorrectionRequestPayload', () => {
  it.each([
    [
      'a present day with a clock-in only, without a clock-out key',
      withValues({}),
      {
        requestedDayStatus: 'PRESENT',
        businessDate: TODAY,
        clockInAt: '2026-11-02T02:00:00.000Z',
        reason: 'Forgot to clock in',
      },
    ],
    [
      'a present day with both times as WIB instants',
      withValues({ clockOutTime: '17:30' }),
      {
        requestedDayStatus: 'PRESENT',
        businessDate: TODAY,
        clockInAt: '2026-11-02T02:00:00.000Z',
        clockOutAt: '2026-11-02T10:30:00.000Z',
        reason: 'Forgot to clock in',
      },
    ],
    [
      'a sick leave with no time keys, although times were typed',
      withValues({ requestedDayStatus: 'SICK_LEAVE', clockInTime: '09:00', clockOutTime: '17:00' }),
      { requestedDayStatus: 'SICK_LEAVE', businessDate: TODAY, reason: 'Forgot to clock in' },
    ],
    [
      'a leave with no time keys, although times were typed',
      withValues({ requestedDayStatus: 'LEAVE', clockInTime: '09:00', clockOutTime: '' }),
      { requestedDayStatus: 'LEAVE', businessDate: TODAY, reason: 'Forgot to clock in' },
    ],
    [
      'a present day whose clock-in is WIB midnight, the day before in UTC',
      withValues({ clockInTime: '00:00' }),
      {
        requestedDayStatus: 'PRESENT',
        businessDate: TODAY,
        clockInAt: '2026-11-01T17:00:00.000Z',
        reason: 'Forgot to clock in',
      },
    ],
    [
      'a reason with surrounding spaces, trimmed',
      withValues({ requestedDayStatus: 'LEAVE', reason: '  Doctor visit  ' }),
      { requestedDayStatus: 'LEAVE', businessDate: TODAY, reason: 'Doctor visit' },
    ],
  ])('should build the exact body for %s', (_description, values, expected) => {
    expect(toCorrectionRequestPayload(values)).toStrictEqual(expected);
  });

  it.each([
    ['a present day with a clock-in only', withValues({})],
    ['a present day with both times', withValues({ clockOutTime: '17:30' })],
    ['a sick leave day', withValues({ requestedDayStatus: 'SICK_LEAVE', clockInTime: '' })],
    ['a leave day with times typed', withValues({ requestedDayStatus: 'LEAVE' })],
  ])('should pass the shared contract for %s once the key is added', (_description, values) => {
    const request = { ...toCorrectionRequestPayload(values), idempotencyKey: KEY };

    expect(submitCorrectionRequestSchema.safeParse(request).success).toBe(true);
  });
});
