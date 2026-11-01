import { z } from 'zod';
import { createPageSchema, paginationQuerySchema } from '../pagination/pagination.schema.js';
import { attendanceDayStatusSchema } from './attendance-day-status.schema.js';
import { checkInClassificationSchema } from './clock-in.schema.js';
import { checkOutClassificationSchema } from './clock-out.schema.js';

// YYYY-MM-DD dates order the same way as the calendar days they name, so a string comparison is a date comparison.
export function isSummaryRangeOrdered(from: string, to: string): boolean {
  return from <= to;
}

// from and to are optional here: the service fills a missing bound from the clock (PRD SUM-1). The pair is checked
// only when both are given; a range whose defaulted bound is out of order is refused by the service. Strict, so an
// unknown query parameter is refused rather than ignored.
export const attendanceSummaryQuerySchema = paginationQuerySchema
  .extend({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .superRefine((query, context) => {
    if (query.from === undefined || query.to === undefined) return;
    if (isSummaryRangeOrdered(query.from, query.to)) return;
    context.addIssue({ code: 'custom', path: ['from'], message: 'must not be after to' });
  });

export type AttendanceSummaryQuery = z.infer<typeof attendanceSummaryQuerySchema>;

// dayStatus is the stored DAY status (PRD SUM-6). approvedOvertimeMinutes is the total of the day's APPROVED overtime
// intervals (DATABASE §5.7). It keeps the seconds of each interval, so it is not rounded, the same as the HR review
// queue (OT-4). It is 0 when the day has no approved overtime.
const attendanceSummaryBaseSchema = z.object({
  businessDate: z.iso.date(),
  dayStatus: attendanceDayStatusSchema,
  approvedOvertimeMinutes: z.number().nonnegative(),
});

// A day that a request created has no punch yet (DATABASE §5.4), so it has no check-in time. Its stored check-in
// status is PENDING_CHECKIN on a working day or CHECKIN_NOT_REQUIRED on a day off (D-59).
const noCheckInStatusSchema = z.enum(['PENDING_CHECKIN', 'CHECKIN_NOT_REQUIRED']);
const noCheckOutStatusSchema = z.enum(['PENDING_CHECKOUT', 'CHECKOUT_NOT_REQUIRED']);

// One row per recorded day (PRD SUM-3, SUM-4), including a day with no check-in (D-59). With no check-out yet, the
// status is PENDING_CHECKOUT on a working day or CHECKOUT_NOT_REQUIRED on a day off, which is the stored status either way.
export const attendanceSummaryItemSchema = z.union([
  attendanceSummaryBaseSchema.extend({
    clockInAt: z.iso.datetime(),
    clockInStatus: checkInClassificationSchema,
    clockOutAt: z.iso.datetime(),
    clockOutStatus: checkOutClassificationSchema,
  }),
  attendanceSummaryBaseSchema.extend({
    clockInAt: z.iso.datetime(),
    clockInStatus: checkInClassificationSchema,
    clockOutAt: z.null(),
    clockOutStatus: noCheckOutStatusSchema,
  }),
  attendanceSummaryBaseSchema.extend({
    clockInAt: z.null(),
    clockInStatus: noCheckInStatusSchema,
    clockOutAt: z.null(),
    clockOutStatus: noCheckOutStatusSchema,
  }),
]);

export type AttendanceSummaryItem = z.infer<typeof attendanceSummaryItemSchema>;

export const attendanceSummaryPageSchema = createPageSchema(attendanceSummaryItemSchema);

export type AttendanceSummaryPage = z.infer<typeof attendanceSummaryPageSchema>;
