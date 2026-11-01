import {
  correctionRequestSchema,
  submitCorrectionRequestSchema,
} from './submit-correction-request.schema.js';
import { REQUEST_REASON_MAX_LENGTH } from './request-fields.schema.js';

const PRESENT_REQUEST = {
  requestedDayStatus: 'PRESENT',
  businessDate: '2026-11-02',
  clockInAt: '2026-11-02T09:05:00+07:00',
  clockOutAt: '2026-11-02T18:00:00+07:00',
  reason: '  Forgot to clock in  ',
  idempotencyKey: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13',
};

const LEAVE_REQUEST = {
  requestedDayStatus: 'SICK_LEAVE',
  businessDate: '2026-11-02',
  reason: 'Fever, doctor note on file',
  idempotencyKey: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13',
};

// Removes one field, so the schema sees the key as absent rather than as an undefined value.
function withoutField(record: Record<string, unknown>, field: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => key !== field));
}

const VALID_RESPONSE = {
  id: '0b9e8d7c-6a5f-4e3d-8c2b-1a0f9e8d7c6b',
  businessDate: '2026-11-02',
  requestedDayStatus: 'PRESENT',
  clockInAt: '2026-11-02T02:05:00.000Z',
  clockOutAt: '2026-11-02T11:00:00.000Z',
  reason: 'Forgot to clock in',
  status: 'PENDING',
  createdAt: '2026-11-02T10:00:00.000Z',
};

describe('submitCorrectionRequestSchema', () => {
  it('should accept a PRESENT correction with both times and trim the reason', () => {
    expect(submitCorrectionRequestSchema.parse(PRESENT_REQUEST)).toEqual({
      ...PRESENT_REQUEST,
      reason: 'Forgot to clock in',
    });
  });

  it('should accept a PRESENT correction without a clock-out', () => {
    expect(
      submitCorrectionRequestSchema.safeParse(withoutField(PRESENT_REQUEST, 'clockOutAt')).success,
    ).toBe(true);
  });

  it.each(['SICK_LEAVE', 'LEAVE'])('should accept a %s correction with no times', (status) => {
    expect(
      submitCorrectionRequestSchema.parse({ ...LEAVE_REQUEST, requestedDayStatus: status })
        .requestedDayStatus,
    ).toBe(status);
  });

  it.each([
    {
      condition: 'a leave outcome has a clock-in',
      override: { clockInAt: '2026-11-02T09:00:00+07:00' },
    },
    {
      condition: 'a leave outcome has a clock-out',
      override: { clockOutAt: '2026-11-02T18:00:00+07:00' },
    },
    { condition: 'a leave outcome has a null clock-in', override: { clockInAt: null } },
  ])('should reject the request when $condition', ({ override }) => {
    expect(submitCorrectionRequestSchema.safeParse({ ...LEAVE_REQUEST, ...override }).success).toBe(
      false,
    );
  });

  it('should reject a PRESENT correction without a clock-in', () => {
    expect(
      submitCorrectionRequestSchema.safeParse(withoutField(PRESENT_REQUEST, 'clockInAt')).success,
    ).toBe(false);
  });

  it('should reject an outcome that is not one of the three requestable statuses', () => {
    expect(
      submitCorrectionRequestSchema.safeParse({
        ...LEAVE_REQUEST,
        requestedDayStatus: 'NOT_ATTEND',
      }).success,
    ).toBe(false);
  });

  it.each([
    { field: 'accountId', value: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13' },
    { field: 'requestedByAccountId', value: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13' },
    { field: 'status', value: 'APPROVED' },
    { field: 'attendanceDayId', value: '0b9e8d7c-6a5f-4e3d-8c2b-1a0f9e8d7c6b' },
    { field: 'baseRevision', value: 3 },
  ])('should reject the request when the client sends $field', ({ field, value }) => {
    expect(
      submitCorrectionRequestSchema.safeParse({ ...PRESENT_REQUEST, [field]: value }).success,
    ).toBe(false);
  });

  it.each([
    { condition: 'the reason is blank', override: { reason: '   ' } },
    {
      condition: 'the reason is longer than the bound',
      override: { reason: 'x'.repeat(REQUEST_REASON_MAX_LENGTH + 1) },
    },
    {
      condition: 'the business date is not a calendar date',
      override: { businessDate: '2026-02-30' },
    },
    {
      condition: 'the clock-in has no offset or Z',
      override: { clockInAt: '2026-11-02T09:05:00' },
    },
    { condition: 'the clock-out is not an instant', override: { clockOutAt: '18:00' } },
    { condition: 'the idempotency key is not a UUID', override: { idempotencyKey: 'retry-1' } },
  ])('should reject the request when $condition', ({ override }) => {
    expect(
      submitCorrectionRequestSchema.safeParse({ ...PRESENT_REQUEST, ...override }).success,
    ).toBe(false);
  });

  it('should reject a request with no outcome', () => {
    expect(
      submitCorrectionRequestSchema.safeParse(withoutField(LEAVE_REQUEST, 'requestedDayStatus'))
        .success,
    ).toBe(false);
  });
});

describe('correctionRequestSchema', () => {
  it.each(['PENDING', 'APPROVED', 'REJECTED'])('should accept the status %s', (status) => {
    expect(correctionRequestSchema.parse({ ...VALID_RESPONSE, status }).status).toBe(status);
  });

  it('should accept a leave response with no times', () => {
    const response = {
      ...VALID_RESPONSE,
      requestedDayStatus: 'LEAVE',
      clockInAt: null,
      clockOutAt: null,
    };

    expect(correctionRequestSchema.safeParse(response).success).toBe(true);
  });

  it('should reject a status that no stored request holds', () => {
    expect(
      correctionRequestSchema.safeParse({ ...VALID_RESPONSE, status: 'CANCELLED' }).success,
    ).toBe(false);
  });

  it('should reject an instant that has a local offset instead of Z', () => {
    const response = { ...VALID_RESPONSE, clockInAt: '2026-11-02T09:05:00+07:00' };

    expect(correctionRequestSchema.safeParse(response).success).toBe(false);
  });
});
