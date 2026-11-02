import { z } from 'zod';
import { requestReviewReasonSchema } from './request-fields.schema.js';

// Strict, so the reviewer comes only from the token: an account ID, a status, or a requester in the body is refused.
// An approval reason is optional. A missing body is read as an approval without a reason.
export const approveOvertimeRequestSchema = z
  .strictObject({
    reviewReason: requestReviewReasonSchema.optional(),
  })
  .default({});

export type ApproveOvertimeRequest = z.infer<typeof approveOvertimeRequestSchema>;

// A rejection requires a reason. The key is required; a blank value passes this schema and is refused by the
// decision rule, so the rule that owns the reason check is the one that answers REVIEW_REASON_REQUIRED.
export const rejectOvertimeRequestSchema = z.strictObject({
  reviewReason: requestReviewReasonSchema,
});

export type RejectOvertimeRequest = z.infer<typeof rejectOvertimeRequestSchema>;
