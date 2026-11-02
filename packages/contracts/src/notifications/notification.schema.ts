import { z } from 'zod';
import { ACCOUNT_PASSWORD_CHANGED_FIELD } from '../events/account-password-changed.schema.js';
import { attendanceRequestResourceTypeSchema } from '../events/attendance-request.schema.js';
import { PROFILE_FIELDS } from '../events/employee-profile-updated.schema.js';
import { EventName } from '../events/event-name.js';

// The SSE event name that carries one notification. The gateway relays it unchanged, and the admin app
// listens for it by name.
export const NOTIFICATION_STREAM_EVENT_NAME = 'notification';

// Matches the source events that create HR inbox rows.
export const notificationEventTypeSchema = z.enum([
  EventName.EMPLOYEE_PROFILE_UPDATED,
  EventName.ACCOUNT_PASSWORD_CHANGED,
  EventName.ATTENDANCE_REQUEST_SUBMITTED,
]);

// Names only, never values. The password event reports the field "password".
const notifiableFieldSchema = z.enum([...PROFILE_FIELDS, ACCOUNT_PASSWORD_CHANGED_FIELD] as const);

// One HR inbox notification as the browser receives it. readAt is null until the recipient marks it read, so a
// pushed notification always has null there. Strict, so no value, hash or token can ride along as an extra key.
// An attendance request names no field, so its changedFields is empty; its resource fields point the HR reviewer at
// the request. The resource fields are set on attendance request notifications and omitted on the others.
export const notificationSchema = z.strictObject({
  id: z.uuid(),
  eventType: notificationEventTypeSchema,
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  data: z.strictObject({
    changedFields: z.array(notifiableFieldSchema),
    resourceType: attendanceRequestResourceTypeSchema.optional(),
    resourceId: z.uuid().optional(),
    businessDate: z.iso.date().optional(),
  }),
  occurredAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  readAt: z.iso.datetime().nullable(),
});

export type Notification = z.infer<typeof notificationSchema>;
