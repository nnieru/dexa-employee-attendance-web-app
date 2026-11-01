import { REQUEST_REASON_MAX_LENGTH } from './request-fields.schema.js';
import {
  overtimeRequestSchema,
  submitOvertimeRequestSchema,
} from './submit-overtime-request.schema.js';

const VALID_REQUEST = {
  businessDate: '2026-11-02',
  startAt: '2026-11-02T11:00:00Z',
  endAt: '2026-11-02T13:00:00Z',
  reason: '  Release deployment  ',
  idempotencyKey: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13',
};

const VALID_RESPONSE = {
  id: '0b9e8d7c-6a5f-4e3d-8c2b-1a0f9e8d7c6b',
  businessDate: '2026-11-02',
  startAt: '2026-11-02T11:00:00.000Z',
  endAt: '2026-11-02T13:00:00.000Z',
  reason: 'Release deployment',
  status: 'PENDING',
  createdAt: '2026-11-02T10:00:00.000Z',
};

describe('submitOvertimeRequestSchema', () => {
  it('should accept the request and trim the reason', () => {
    expect(submitOvertimeRequestSchema.parse(VALID_REQUEST)).toEqual({
      ...VALID_REQUEST,
      reason: 'Release deployment',
    });
  });

  it('should accept start and end instants written with a local offset', () => {
    const request = {
      ...VALID_REQUEST,
      startAt: '2026-11-02T18:00:00+07:00',
      endAt: '2026-11-02T20:00:00+07:00',
    };

    expect(submitOvertimeRequestSchema.parse(request)).toMatchObject({
      startAt: '2026-11-02T18:00:00+07:00',
      endAt: '2026-11-02T20:00:00+07:00',
    });
  });

  it.each([
    { field: 'accountId', value: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13' },
    { field: 'requestedByAccountId', value: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13' },
    { field: 'status', value: 'APPROVED' },
    { field: 'attendanceDayId', value: '0b9e8d7c-6a5f-4e3d-8c2b-1a0f9e8d7c6b' },
  ])('should reject the request when the client sends $field', ({ field, value }) => {
    expect(
      submitOvertimeRequestSchema.safeParse({ ...VALID_REQUEST, [field]: value }).success,
    ).toBe(false);
  });

  it.each([
    { condition: 'the reason is blank', reason: '   ' },
    {
      condition: 'the reason is longer than the bound',
      reason: 'x'.repeat(REQUEST_REASON_MAX_LENGTH + 1),
    },
  ])('should reject the request when $condition', ({ reason }) => {
    expect(submitOvertimeRequestSchema.safeParse({ ...VALID_REQUEST, reason }).success).toBe(false);
  });

  it.each([
    { condition: 'the business date is not a calendar date', businessDate: '2026-02-30' },
    { condition: 'the start has no offset or Z', startAt: '2026-11-02T18:00:00' },
    { condition: 'the end is not an instant', endAt: '02/11/2026 20:00' },
    { condition: 'the idempotency key is not a UUID', idempotencyKey: 'retry-1' },
  ])('should reject the request when $condition', (override) => {
    expect(submitOvertimeRequestSchema.safeParse({ ...VALID_REQUEST, ...override }).success).toBe(
      false,
    );
  });
});

describe('overtimeRequestSchema', () => {
  it.each(['PENDING', 'APPROVED', 'REJECTED'])('should accept the status %s', (status) => {
    expect(overtimeRequestSchema.parse({ ...VALID_RESPONSE, status }).status).toBe(status);
  });

  it('should reject a status that no stored request holds', () => {
    expect(
      overtimeRequestSchema.safeParse({ ...VALID_RESPONSE, status: 'CANCELLED' }).success,
    ).toBe(false);
  });

  it('should reject an instant that has a local offset instead of Z', () => {
    const response = { ...VALID_RESPONSE, startAt: '2026-11-02T18:00:00+07:00' };

    expect(overtimeRequestSchema.safeParse(response).success).toBe(false);
  });
});
