import { z } from 'zod';
import { accountIdSchema } from '../auth/account-lookup.schema.js';

// The password event names the field only. A password, its hash or a token is never part of the payload.
export const ACCOUNT_PASSWORD_CHANGED_FIELD = 'password';

// Same common fields as employee.profile.updated (see employeeProfileUpdatedPayloadSchema). Strict, so an
// old or new value cannot be added as an extra key.
export const accountPasswordChangedPayloadSchema = z.strictObject({
  accountId: accountIdSchema,
  actorAccountId: accountIdSchema,
  changedFields: z.tuple([z.literal(ACCOUNT_PASSWORD_CHANGED_FIELD)]),
});

export type AccountPasswordChangedPayload = z.infer<typeof accountPasswordChangedPayloadSchema>;
