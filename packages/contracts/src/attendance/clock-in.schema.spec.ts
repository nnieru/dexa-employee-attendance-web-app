import {
  clockInRequestSchema,
  clockInResponseSchema,
  checkInClassificationSchema,
} from './clock-in.schema.js';

const VALID_RESPONSE = {
  type: 'IN',
  recordedAt: '2026-11-02T02:20:00.000Z',
  businessDate: '2026-11-02',
  classification: 'LATE_CHECKIN',
};

describe('clockInRequestSchema', () => {
  it.each([
    { condition: 'the body is missing', body: undefined },
    { condition: 'the body is an empty object', body: {} },
  ])('should accept the request when $condition', ({ body }) => {
    expect(clockInRequestSchema.parse(body)).toEqual({});
  });

  it.each([
    { field: 'recordedAt', value: '2026-11-02T02:20:00.000Z' },
    { field: 'businessDate', value: '2026-11-02' },
    { field: 'accountId', value: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13' },
    { field: 'type', value: 'OUT' },
    { field: 'classification', value: 'ON_TIME_CHECKIN' },
  ])('should reject the request when the client sends $field', ({ field, value }) => {
    expect(clockInRequestSchema.safeParse({ [field]: value }).success).toBe(false);
  });
});

describe('clockInResponseSchema', () => {
  it('should accept the documented response shape', () => {
    expect(clockInResponseSchema.parse(VALID_RESPONSE)).toEqual(VALID_RESPONSE);
  });

  it.each([
    {
      condition: 'recordedAt has a local offset instead of Z',
      recordedAt: '2026-11-02T09:20:00+07:00',
    },
    { condition: 'recordedAt is not an instant', recordedAt: '02/11/2026 09:20' },
  ])('should reject the response when $condition', ({ recordedAt }) => {
    expect(clockInResponseSchema.safeParse({ ...VALID_RESPONSE, recordedAt }).success).toBe(false);
  });

  it('should reject the response when the classification is a clock-out value', () => {
    const response = { ...VALID_RESPONSE, classification: 'LATE_CHECKOUT' };

    expect(clockInResponseSchema.safeParse(response).success).toBe(false);
  });
});

describe('checkInClassificationSchema', () => {
  it.each(['EARLY_CHECKIN', 'ON_TIME_CHECKIN', 'LATE_CHECKIN', 'CHECKIN_NOT_REQUIRED'])(
    'should accept %s',
    (value) => {
      expect(checkInClassificationSchema.parse(value)).toBe(value);
    },
  );
});
