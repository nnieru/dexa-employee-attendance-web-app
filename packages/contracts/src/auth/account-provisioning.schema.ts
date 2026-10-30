import { z } from 'zod';
import { accountIdSchema } from './account-lookup.schema.js';
import { companyEmailSchema } from './company-email.schema.js';
import { passwordSchema } from './password.schema.js';
import { roleSchema } from './role.js';

// Values match accounts and account_provisioning_operations in DATABASE §3.1.
export const AccountProvisioningStatus = { PENDING: 'PENDING', ACTIVE: 'ACTIVE' } as const;

export type AccountProvisioningStatus =
  (typeof AccountProvisioningStatus)[keyof typeof AccountProvisioningStatus];

export const accountProvisioningStatusSchema = z.enum(AccountProvisioningStatus);

export const accountProvisioningOperationIdSchema = z.uuid();

// Strict, so a caller cannot send an account ID or status that the server must decide itself. The email
// is lowercased after it is validated, because company email matching ignores letter case (DATABASE §3).
export const accountProvisioningRequestSchema = z.strictObject({
  operationId: accountProvisioningOperationIdSchema,
  actorAccountId: accountIdSchema,
  email: companyEmailSchema.transform((email) => email.toLowerCase()),
  role: roleSchema,
  initialPassword: passwordSchema,
});

export type AccountProvisioningRequest = z.infer<typeof accountProvisioningRequestSchema>;

// Not strict: a reader that parses a response ignores fields that a later version adds.
export const accountProvisioningOperationSchema = z.object({
  operationId: accountProvisioningOperationIdSchema,
  accountId: accountIdSchema,
  status: accountProvisioningStatusSchema,
});

export type AccountProvisioningOperation = z.infer<typeof accountProvisioningOperationSchema>;
