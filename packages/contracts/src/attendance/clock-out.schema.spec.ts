import {
  checkOutClassificationSchema,
  clockOutRequestSchema,
  clockOutResponseSchema,
} from './clock-out.schema.js';

const VALID_RESPONSE = {
  type: 'OUT',
  recordedAt: '2026-11-02T11:00:00.000Z',
  businessDate: '2026-11-02',
  classification: 'ON_TIME_CHECKOUT',
};

describe('clockOutRequestSchema', () => {
  it.each([
    { condition: 'the body is missing', body: undefined },
    { condition: 'the body is an empty object', body: {} },
  ])('should accept the request when $condition', ({ body }) => {
    expect(clockOutRequestSchema.parse(body)).toEqual({});
  });

  it.each([
    { field: 'recordedAt', value: '2026-11-02T11:00:00.000Z' },
    { field: 'businessDate', value: '2026-11-02' },
    { field: 'accountId', value: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13' },
    { field: 'type', value: 'IN' },
    { field: 'classification', value: 'ON_TIME_CHECKOUT' },
  ])('should reject the request when the client sends $field', ({ field, value }) => {
    expect(clockOutRequestSchema.safeParse({ [field]: value }).success).toBe(false);
  });
});

describe('clockOutResponseSchema', () => {
  it('should accept the documented response shape', () => {
    expect(clockOutResponseSchema.parse(VALID_RESPONSE)).toEqual(VALID_RESPONSE);
  });

  it.each([
    {
      condition: 'recordedAt has a local offset instead of Z',
      recordedAt: '2026-11-02T18:00:00+07:00',
    },
    { condition: 'recordedAt is not an instant', recordedAt: '02/11/2026 18:00' },
  ])('should reject the response when $condition', ({ recordedAt }) => {
    expect(clockOutResponseSchema.safeParse({ ...VALID_RESPONSE, recordedAt }).success).toBe(false);
  });

  it('should reject the response when the classification is a clock-in value', () => {
    const response = { ...VALID_RESPONSE, classification: 'LATE_CHECKIN' };

    expect(clockOutResponseSchema.safeParse(response).success).toBe(false);
  });

  it('should reject the response when the type is IN', () => {
    expect(clockOutResponseSchema.safeParse({ ...VALID_RESPONSE, type: 'IN' }).success).toBe(false);
  });
});

describe('checkOutClassificationSchema', () => {
  it.each(['EARLY_CHECKOUT', 'ON_TIME_CHECKOUT', 'LATE_CHECKOUT', 'CHECKOUT_NOT_REQUIRED'])(
    'should accept %s',
    (value) => {
      expect(checkOutClassificationSchema.parse(value)).toBe(value);
    },
  );
});
