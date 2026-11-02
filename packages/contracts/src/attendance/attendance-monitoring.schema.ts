import { z } from 'zod';
import { createPageSchema, paginationQuerySchema } from '../pagination/pagination.schema.js';
import { attendanceSummaryItemSchema, isSummaryRangeOrdered } from './attendance-summary.schema.js';

// Same range rules as the own summary: any range, and a missing bound is filled by the service from the clock.
// employeeId is the account ID that the employee list shows, so it filters attendance_days without a lookup. Strict,
// so an unknown query parameter is refused rather than ignored.
export const attendanceMonitoringQuerySchema = paginationQuerySchema
  .extend({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    employeeId: z.uuid().optional(),
  })
  .superRefine((query, context) => {
    if (query.from === undefined || query.to === undefined) return;
    if (isSummaryRangeOrdered(query.from, query.to)) return;
    context.addIssue({ code: 'custom', path: ['from'], message: 'must not be after to' });
  });

export type AttendanceMonitoringQuery = z.infer<typeof attendanceMonitoringQuerySchema>;

// Names come from employee-service. An account it does not know is shown as unavailable, which is null
// here, rather than failing the whole page.
const monitoredEmployeeSchema = z.object({
  name: z.string().min(1),
  positionName: z.string().min(1),
});

// One row per recorded day of one account, with the same times and classifications as the own summary.
// rawClockInAt and rawClockOutAt are the original punches, null when the employee has no such punch.
// They stay as punched after an approved correction. isCorrected is true when an approved correction has been applied
// to the day (applied_revision). A correction can make the effective times differ from the raw ones.
export const attendanceMonitoringItemSchema = z.intersection(
  z.object({
    accountId: z.uuid(),
    employee: monitoredEmployeeSchema.nullable(),
    rawClockInAt: z.iso.datetime().nullable(),
    rawClockOutAt: z.iso.datetime().nullable(),
    isCorrected: z.boolean(),
  }),
  attendanceSummaryItemSchema,
);

export type AttendanceMonitoringItem = z.infer<typeof attendanceMonitoringItemSchema>;

export const attendanceMonitoringPageSchema = createPageSchema(attendanceMonitoringItemSchema);

export type AttendanceMonitoringPage = z.infer<typeof attendanceMonitoringPageSchema>;
