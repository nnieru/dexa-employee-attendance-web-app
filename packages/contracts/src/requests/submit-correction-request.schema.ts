import { z } from 'zod';
import { requestIdempotencyKeySchema, requestReasonSchema } from './request-fields.schema.js';
import { requestStatusSchema } from './request-status.schema.js';

// The outcomes an employee can ask for (PRD COR-1, DATABASE §5.8). The values are the DAY status codes.
export const requestedCorrectionDayStatusSchema = z.enum(['PRESENT', 'SICK_LEAVE', 'LEAVE']);

const correctionCommonFields = {
  businessDate: z.iso.date(),
  reason: requestReasonSchema,
  idempotencyKey: requestIdempotencyKeySchema,
};

// Present needs a clock-in; the clock-out is optional. Leave outcomes carry no times, so a time in their body is refused
// by the strict object (COR-1). Strict objects also refuse any requester, status, or review field, as for overtime.
const presentCorrectionSchema = z.strictObject({
  ...correctionCommonFields,
  requestedDayStatus: z.literal('PRESENT'),
  clockInAt: z.iso.datetime({ offset: true }),
  clockOutAt: z.iso.datetime({ offset: true }).optional(),
});

const leaveCorrectionSchema = z.strictObject({
  ...correctionCommonFields,
  requestedDayStatus: z.enum(['SICK_LEAVE', 'LEAVE']),
});

// The branch is picked by requestedDayStatus, so each outcome accepts only its own fields.
export const submitCorrectionRequestSchema = z.discriminatedUnion('requestedDayStatus', [
  presentCorrectionSchema,
  leaveCorrectionSchema,
]);

export type SubmitCorrectionRequest = z.infer<typeof submitCorrectionRequestSchema>;

// clockInAt and clockOutAt are UTC instants with a Z suffix. Both are null for a leave outcome.
export const correctionRequestSchema = z.object({
  id: z.uuid(),
  businessDate: z.iso.date(),
  requestedDayStatus: requestedCorrectionDayStatusSchema,
  clockInAt: z.iso.datetime().nullable(),
  clockOutAt: z.iso.datetime().nullable(),
  reason: z.string(),
  status: requestStatusSchema,
  createdAt: z.iso.datetime(),
});

export type CorrectionRequest = z.infer<typeof correctionRequestSchema>;
