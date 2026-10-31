import { z } from 'zod';
import { ACCOUNT_PASSWORD_CHANGED_FIELD } from '../events/account-password-changed.schema.js';
import { PROFILE_FIELDS } from '../events/employee-profile-updated.schema.js';
import { EventName } from '../events/event-name.js';

// The SSE event name that carries one notification (ADM-5). The gateway relays it unchanged, and the admin app
// listens for it by name.
export const NOTIFICATION_STREAM_EVENT_NAME = 'notification';

// Matches the source events that create HR inbox rows (DATABASE §7.1).
export const notificationEventTypeSchema = z.enum([
  EventName.EMPLOYEE_PROFILE_UPDATED,
  EventName.ACCOUNT_PASSWORD_CHANGED,
]);

// Names only, never values (ARCHITECTURE §8). The password event reports the field "password".
const notifiableFieldSchema = z.enum([...PROFILE_FIELDS, ACCOUNT_PASSWORD_CHANGED_FIELD] as const);

// One HR inbox notification as the browser receives it. readAt is null until the recipient marks it read, so a
// pushed notification always has null there. Strict, so no value, hash or token can ride along as an extra key.
export const notificationSchema = z.strictObject({
  id: z.uuid(),
  eventType: notificationEventTypeSchema,
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  data: z.strictObject({
    changedFields: z.array(notifiableFieldSchema).min(1),
  }),
  occurredAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  readAt: z.iso.datetime().nullable(),
});

export type Notification = z.infer<typeof notificationSchema>;
