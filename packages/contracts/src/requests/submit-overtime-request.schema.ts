import { z } from 'zod';
import { requestIdempotencyKeySchema, requestReasonSchema } from './request-fields.schema.js';
import { requestStatusSchema } from './request-status.schema.js';

// Strict, so the requester comes only from the token: an account ID, a status, or a review field in the body is refused.
// startAt and endAt are instants. An offset is accepted so the client can send WIB times, and the server stores the instant.
export const submitOvertimeRequestSchema = z.strictObject({
  businessDate: z.iso.date(),
  startAt: z.iso.datetime({ offset: true }),
  endAt: z.iso.datetime({ offset: true }),
  reason: requestReasonSchema,
  idempotencyKey: requestIdempotencyKeySchema,
});

export type SubmitOvertimeRequest = z.infer<typeof submitOvertimeRequestSchema>;

// startAt and endAt are UTC instants with a Z suffix. businessDate is the WIB calendar date the request belongs to.
// reviewReason and reviewedAt are null until HR decides. A rejection carries its reason.
export const overtimeRequestSchema = z.object({
  id: z.uuid(),
  businessDate: z.iso.date(),
  startAt: z.iso.datetime(),
  endAt: z.iso.datetime(),
  reason: z.string(),
  status: requestStatusSchema,
  reviewReason: z.string().nullable(),
  reviewedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export type OvertimeRequest = z.infer<typeof overtimeRequestSchema>;
