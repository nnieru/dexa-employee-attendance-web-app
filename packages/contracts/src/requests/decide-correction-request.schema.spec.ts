import { REQUEST_REASON_MAX_LENGTH } from './request-fields.schema.js';
import {
  approveCorrectionRequestSchema,
  rejectCorrectionRequestSchema,
} from './decide-correction-request.schema.js';

const REQUEST_ID = '0b9e8d7c-6a5f-4e3d-8c2b-1a0f9e8d7c6b';

describe('approveCorrectionRequestSchema', () => {
  it('should accept an approval without a reason', () => {
    expect(approveCorrectionRequestSchema.parse({})).toEqual({});
  });

  it('should read a missing body as an approval without a reason', () => {
    expect(approveCorrectionRequestSchema.parse(undefined)).toEqual({});
  });

  it('should accept an approval reason and trim it', () => {
    expect(approveCorrectionRequestSchema.parse({ reviewReason: '  Confirmed  ' })).toEqual({
      reviewReason: 'Confirmed',
    });
  });

  it.each([
    { field: 'reviewerAccountId', value: REQUEST_ID },
    { field: 'status', value: 'APPROVED' },
    { field: 'applied_revision', value: 2 },
  ])('should reject the body when the client sends $field', ({ field, value }) => {
    expect(approveCorrectionRequestSchema.safeParse({ [field]: value }).success).toBe(false);
  });

  it('should reject an approval reason longer than the bound', () => {
    const reviewReason = 'x'.repeat(REQUEST_REASON_MAX_LENGTH + 1);

    expect(approveCorrectionRequestSchema.safeParse({ reviewReason }).success).toBe(false);
  });
});

describe('rejectCorrectionRequestSchema', () => {
  it('should accept a rejection with a reason and trim it', () => {
    expect(rejectCorrectionRequestSchema.parse({ reviewReason: ' Clock records differ ' })).toEqual(
      { reviewReason: 'Clock records differ' },
    );
  });

  it('should pass a blank reason through so the decision rule refuses it', () => {
    expect(rejectCorrectionRequestSchema.parse({ reviewReason: '   ' })).toEqual({
      reviewReason: '',
    });
  });

  it('should reject a body without the reason key', () => {
    expect(rejectCorrectionRequestSchema.safeParse({}).success).toBe(false);
  });

  it('should reject a body with an unknown key', () => {
    const body = { reviewReason: 'Clock records differ', reviewedByAccountId: REQUEST_ID };

    expect(rejectCorrectionRequestSchema.safeParse(body).success).toBe(false);
  });

  it('should reject a reason longer than the bound', () => {
    const reviewReason = 'x'.repeat(REQUEST_REASON_MAX_LENGTH + 1);

    expect(rejectCorrectionRequestSchema.safeParse({ reviewReason }).success).toBe(false);
  });
});
