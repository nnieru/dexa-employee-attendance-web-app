import { z } from 'zod';
import { requestReviewReasonSchema } from './request-fields.schema.js';

// Strict, so the reviewer comes only from the token: an account ID, a status, or a requester in the body is refused.
// An approval reason is optional (APR-2). A missing body is read as an approval without a reason.
export const approveCorrectionRequestSchema = z
  .strictObject({
    reviewReason: requestReviewReasonSchema.optional(),
  })
  .default({});

export type ApproveCorrectionRequest = z.infer<typeof approveCorrectionRequestSchema>;

// A rejection requires a reason (APR-2). The key is required; a blank value passes this schema and is refused by the
// decision rule, so the rule that owns the reason check is the one that answers REVIEW_REASON_REQUIRED.
export const rejectCorrectionRequestSchema = z.strictObject({
  reviewReason: requestReviewReasonSchema,
});

export type RejectCorrectionRequest = z.infer<typeof rejectCorrectionRequestSchema>;
