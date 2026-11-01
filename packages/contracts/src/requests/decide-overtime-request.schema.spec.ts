import { REQUEST_REASON_MAX_LENGTH, requestIdSchema } from './request-fields.schema.js';
import {
  approveOvertimeRequestSchema,
  rejectOvertimeRequestSchema,
} from './decide-overtime-request.schema.js';

const REQUEST_ID = '0b9e8d7c-6a5f-4e3d-8c2b-1a0f9e8d7c6b';

describe('approveOvertimeRequestSchema', () => {
  it('should accept an approval without a reason', () => {
    expect(approveOvertimeRequestSchema.parse({})).toEqual({});
  });

  it('should read a missing body as an approval without a reason', () => {
    expect(approveOvertimeRequestSchema.parse(undefined)).toEqual({});
  });

  it('should accept an approval reason and trim it', () => {
    expect(approveOvertimeRequestSchema.parse({ reviewReason: '  Confirmed  ' })).toEqual({
      reviewReason: 'Confirmed',
    });
  });

  it.each([
    { field: 'reviewerAccountId', value: REQUEST_ID },
    { field: 'status', value: 'APPROVED' },
  ])('should reject the body when the client sends $field', ({ field, value }) => {
    expect(approveOvertimeRequestSchema.safeParse({ [field]: value }).success).toBe(false);
  });

  it('should reject an approval reason longer than the bound', () => {
    const reviewReason = 'x'.repeat(REQUEST_REASON_MAX_LENGTH + 1);

    expect(approveOvertimeRequestSchema.safeParse({ reviewReason }).success).toBe(false);
  });
});

describe('rejectOvertimeRequestSchema', () => {
  it('should accept a rejection with a reason and trim it', () => {
    expect(rejectOvertimeRequestSchema.parse({ reviewReason: ' Overlaps release ' })).toEqual({
      reviewReason: 'Overlaps release',
    });
  });

  it('should pass a blank reason through so the decision rule refuses it', () => {
    expect(rejectOvertimeRequestSchema.parse({ reviewReason: '   ' })).toEqual({
      reviewReason: '',
    });
  });

  it('should reject a body without the reason key', () => {
    expect(rejectOvertimeRequestSchema.safeParse({}).success).toBe(false);
  });

  it('should reject a body with an unknown key', () => {
    const body = { reviewReason: 'Overlaps release', reviewedByAccountId: REQUEST_ID };

    expect(rejectOvertimeRequestSchema.safeParse(body).success).toBe(false);
  });

  it('should reject a reason longer than the bound', () => {
    const reviewReason = 'x'.repeat(REQUEST_REASON_MAX_LENGTH + 1);

    expect(rejectOvertimeRequestSchema.safeParse({ reviewReason }).success).toBe(false);
  });
});

describe('requestIdSchema', () => {
  it('should accept a UUID', () => {
    expect(requestIdSchema.parse(REQUEST_ID)).toBe(REQUEST_ID);
  });

  it('should reject a value that is not a UUID', () => {
    expect(requestIdSchema.safeParse('not-a-uuid').success).toBe(false);
  });
});
