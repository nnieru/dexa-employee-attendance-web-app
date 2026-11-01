import { submitOvertimeRequestSchema } from '@dexa/contracts';
import { describe, expect, it } from 'vitest';
import {
  createOvertimeRequestFormSchema,
  getOvertimeBusinessDateBounds,
  OVERTIME_FORM_MESSAGES,
  toOvertimeRequestPayload,
  type OvertimeRequestFormValues,
} from './overtime-request-form.schema.js';

// Today in WIB is 2026-11-02 (the UTC date is still 2026-11-01 at that moment).
const TODAY = '2026-11-02';
const schema = createOvertimeRequestFormSchema(TODAY);
const VALID_VALUES: OvertimeRequestFormValues = {
  businessDate: TODAY,
  startTime: '18:30',
  endTime: '21:00',
  reason: 'Month-end reporting deadline',
};

/** The first problem with the values, as the field path and message the form shows; null when they are valid. */
function firstProblem(values: OvertimeRequestFormValues): { path: string; message: string } | null {
  const result = schema.safeParse(values);
  if (result.success) return null;
  const [issue] = result.error.issues;
  if (issue === undefined) throw new Error('A failed parse has no issue.');
  return { path: issue.path.join('.'), message: issue.message };
}

describe('getOvertimeBusinessDateBounds', () => {
  it('should give seven days back through today as the selectable window', () => {
    expect(getOvertimeBusinessDateBounds(TODAY)).toEqual({
      earliest: '2026-10-26',
      latest: '2026-11-02',
    });
  });
});

describe('createOvertimeRequestFormSchema', () => {
  it.each([
    ['today', { businessDate: '2026-11-02' }, null],
    ['seven days back, the oldest allowed date', { businessDate: '2026-10-26' }, null],
    [
      'eight days back',
      { businessDate: '2026-10-25' },
      { path: 'businessDate', message: OVERTIME_FORM_MESSAGES.businessDateOutsideWindow },
    ],
    [
      'tomorrow in WIB',
      { businessDate: '2026-11-03' },
      { path: 'businessDate', message: OVERTIME_FORM_MESSAGES.businessDateOutsideWindow },
    ],
    [
      'an empty business date',
      { businessDate: '' },
      { path: 'businessDate', message: OVERTIME_FORM_MESSAGES.businessDateRequired },
    ],
    ['an end time later than the start time', { startTime: '09:00', endTime: '10:00' }, null],
    [
      'an end time earlier than the start time, which means the next day',
      { startTime: '22:00', endTime: '01:00' },
      null,
    ],
    [
      'an end time equal to the start time',
      { startTime: '18:30', endTime: '18:30' },
      { path: 'endTime', message: OVERTIME_FORM_MESSAGES.endNotAfterStart },
    ],
    [
      'an empty start time',
      { startTime: '' },
      { path: 'startTime', message: OVERTIME_FORM_MESSAGES.startTimeRequired },
    ],
    [
      'an hour that does not exist',
      { endTime: '24:00' },
      { path: 'endTime', message: OVERTIME_FORM_MESSAGES.endTimeRequired },
    ],
    [
      'a blank reason',
      { reason: '   ' },
      { path: 'reason', message: OVERTIME_FORM_MESSAGES.reasonRequired },
    ],
    [
      'a reason of 501 characters',
      { reason: 'x'.repeat(501) },
      { path: 'reason', message: OVERTIME_FORM_MESSAGES.reasonTooLong },
    ],
    [
      'a reason of 500 characters once the surrounding spaces are trimmed',
      { reason: `  ${'x'.repeat(500)}  ` },
      null,
    ],
  ])('should give %s the problem %j', (_description, overrides, expected) => {
    expect(firstProblem({ ...VALID_VALUES, ...overrides })).toEqual(expected);
  });
});

describe('toOvertimeRequestPayload', () => {
  it('should build the contract request content with WIB instants and a trimmed reason', () => {
    const payload = toOvertimeRequestPayload({
      ...VALID_VALUES,
      startTime: '22:00',
      endTime: '01:00',
      reason: '  Data migration  ',
    });

    expect(payload).toEqual({
      businessDate: '2026-11-02',
      startAt: '2026-11-02T15:00:00.000Z',
      endAt: '2026-11-02T18:00:00.000Z',
      reason: 'Data migration',
    });
  });

  it('should pass the contract with an idempotency key added', () => {
    const payload = toOvertimeRequestPayload(VALID_VALUES);

    const result = submitOvertimeRequestSchema.safeParse({
      ...payload,
      idempotencyKey: '3c1f7e2a-9d4b-4a6e-8f0c-5b2d1e9a7c01',
    });

    expect(result.success).toBe(true);
  });
});
