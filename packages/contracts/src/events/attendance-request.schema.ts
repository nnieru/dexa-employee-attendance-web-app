import { z } from 'zod';
import { accountIdSchema } from '../auth/account-lookup.schema.js';

export const ATTENDANCE_REQUEST_RESOURCE_TYPES = [
  'overtime_request',
  'attendance_adjustment_request',
] as const;

export type AttendanceRequestResourceType = (typeof ATTENDANCE_REQUEST_RESOURCE_TYPES)[number];

export const attendanceRequestResourceTypeSchema = z.enum(ATTENDANCE_REQUEST_RESOURCE_TYPES);

/**
 * Event payload for attendance.request.submitted, attendance.request.approved, and attendance.request.rejected
 * (ARCHITECTURE §8, PRD APR-7).
 *
 * Strict, so no reasons, timestamps, passwords, or extra fields can ride along. changedFields is always empty.
 */
export const attendanceRequestEventPayloadSchema = z.strictObject({
  accountId: accountIdSchema,
  actorAccountId: accountIdSchema,
  resourceType: attendanceRequestResourceTypeSchema,
  resourceId: z.uuid(),
  businessDate: z.iso.date(),
  changedFields: z.tuple([]),
});

export type AttendanceRequestEventPayload = z.infer<typeof attendanceRequestEventPayloadSchema>;
