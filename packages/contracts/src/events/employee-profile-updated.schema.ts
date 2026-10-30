import { z } from 'zod';
import { accountIdSchema } from '../auth/account-lookup.schema.js';

// Profile fields whose change is reported by name. The payload carries names only, never old or new values.
export const PROFILE_FIELDS = [
  'phoneNumber',
  'photo',
  'name',
  'position',
  'employeeStatus',
  'profileStatus',
] as const;

export type ProfileField = (typeof PROFILE_FIELDS)[number];

export const profileFieldSchema = z.enum(PROFILE_FIELDS);

// Matches the employee name column length, so the popup text fits what is stored.
const EMPLOYEE_NAME_MAX_LENGTH = 150;

// ARCHITECTURE §8 lists the common envelope fields eventId and occurredAt; they live in eventEnvelopeSchema.
// This payload carries the rest of the common fields (accountId, actorAccountId) plus the event's own fields.
// Strict, so no value, hash or token can ride along as an extra key.
export const employeeProfileUpdatedPayloadSchema = z.strictObject({
  accountId: accountIdSchema,
  actorAccountId: accountIdSchema,
  employeeName: z.string().trim().min(1).max(EMPLOYEE_NAME_MAX_LENGTH),
  changedFields: z
    .array(profileFieldSchema)
    .min(1)
    .refine((fields) => new Set(fields).size === fields.length, {
      error: 'must not repeat a field name',
    }),
});

export type EmployeeProfileUpdatedPayload = z.infer<typeof employeeProfileUpdatedPayloadSchema>;
