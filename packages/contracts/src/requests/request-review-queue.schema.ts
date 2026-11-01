import { z } from 'zod';
import { attendanceDayStatusSchema } from '../attendance/attendance-day-status.schema.js';
import { isSummaryRangeOrdered } from '../attendance/attendance-summary.schema.js';
import { createPageSchema, paginationQuerySchema } from '../pagination/pagination.schema.js';
import { requestStatusSchema } from './request-status.schema.js';
import { correctionRequestSchema } from './submit-correction-request.schema.js';
import { overtimeRequestSchema } from './submit-overtime-request.schema.js';

// The HR review queue (APR-1). status defaults to PENDING. employeeId is the requester's account ID. A missing from or
// to leaves that end of the business-date range open, because a pending request can be up to 30 days old. Strict, so an
// unknown parameter is refused rather than ignored.
export const requestReviewQueueQuerySchema = paginationQuerySchema
  .extend({
    status: requestStatusSchema.default('PENDING'),
    employeeId: z.uuid().optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .superRefine((query, context) => {
    if (query.from === undefined || query.to === undefined) return;
    if (isSummaryRangeOrdered(query.from, query.to)) return;
    context.addIssue({ code: 'custom', path: ['from'], message: 'must not be after to' });
  });

export type RequestReviewQueueQuery = z.infer<typeof requestReviewQueueQuerySchema>;

// The requester's name comes from employee-service. It is null when Employee does not know the account (DATABASE §8), so
// one unknown profile never fails the page.
export const requestRequesterSchema = z.object({
  accountId: z.uuid(),
  name: z.string().min(1).nullable(),
});

export type RequestRequester = z.infer<typeof requestRequesterSchema>;

// approvedMinutes is the requester's APPROVED overtime on the same business date (OT-4). It includes this request when
// this request is approved. Minutes keep their seconds, so the value is not rounded.
export const overtimeRequestReviewItemSchema = overtimeRequestSchema.extend({
  requester: requestRequesterSchema,
  isOwnRequest: z.boolean(),
  current: z.object({
    approvedMinutes: z.number().nonnegative(),
  }),
});

export type OvertimeRequestReviewItem = z.infer<typeof overtimeRequestReviewItemSchema>;

// current holds the business day as it stands now: the effective times and the DAY status (APR-1, DATABASE §5.4).
// The requested values are the top-level clockInAt and clockOutAt, as in the own list.
export const correctionRequestReviewItemSchema = correctionRequestSchema.extend({
  requester: requestRequesterSchema,
  isOwnRequest: z.boolean(),
  current: z.object({
    clockInAt: z.iso.datetime().nullable(),
    clockOutAt: z.iso.datetime().nullable(),
    dayStatus: attendanceDayStatusSchema,
  }),
});

export type CorrectionRequestReviewItem = z.infer<typeof correctionRequestReviewItemSchema>;

export const overtimeRequestReviewPageSchema = createPageSchema(overtimeRequestReviewItemSchema);

export type OvertimeRequestReviewPage = z.infer<typeof overtimeRequestReviewPageSchema>;

export const correctionRequestReviewPageSchema = createPageSchema(
  correctionRequestReviewItemSchema,
);

export type CorrectionRequestReviewPage = z.infer<typeof correctionRequestReviewPageSchema>;
