import { z } from 'zod';
import { requestStatusSchema } from './request-status.schema.js';

// The reason is free text that HR reads on review. DATABASE §5.6 requires it to be non-empty after trimming, and
// this bound keeps one request's text small. It is not a stored column width, because the column is text.
export const REQUEST_REASON_MAX_LENGTH = 500;

// Strict, so the requester comes only from the token: an account ID, a status, or a review field in the body is refused.
// startAt and endAt are instants. An offset is accepted so the client can send WIB times, and the server stores the instant.
export const submitOvertimeRequestSchema = z.strictObject({
  businessDate: z.iso.date(),
  startAt: z.iso.datetime({ offset: true }),
  endAt: z.iso.datetime({ offset: true }),
  reason: z.string().trim().min(1).max(REQUEST_REASON_MAX_LENGTH),
  idempotencyKey: z.uuid(),
});

export type SubmitOvertimeRequest = z.infer<typeof submitOvertimeRequestSchema>;

// startAt and endAt are UTC instants with a Z suffix. businessDate is the WIB calendar date the request belongs to.
export const overtimeRequestSchema = z.object({
  id: z.uuid(),
  businessDate: z.iso.date(),
  startAt: z.iso.datetime(),
  endAt: z.iso.datetime(),
  reason: z.string(),
  status: requestStatusSchema,
  createdAt: z.iso.datetime(),
});

export type OvertimeRequest = z.infer<typeof overtimeRequestSchema>;
