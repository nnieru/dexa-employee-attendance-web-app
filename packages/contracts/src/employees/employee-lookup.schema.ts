import { z } from 'zod';

// Bounds one batched lookup, as ACCOUNT_LOOKUP_MAX_IDS does for auth-service. A caller with more IDs splits the request.
export const EMPLOYEE_LOOKUP_MAX_IDS = 100;

// Strict, so a caller cannot send fields that the lookup does not read.
export const employeeLookupRequestSchema = z.strictObject({
  accountIds: z.array(z.uuid()).min(1).max(EMPLOYEE_LOOKUP_MAX_IDS),
});

export type EmployeeLookupRequest = z.infer<typeof employeeLookupRequestSchema>;

// Not strict: a reader that parses a response ignores fields that a later version adds.
export const employeeLookupItemSchema = z.object({
  accountId: z.uuid(),
  name: z.string().min(1),
  positionName: z.string().min(1),
});

export type EmployeeLookupItem = z.infer<typeof employeeLookupItemSchema>;

export const employeeLookupResponseSchema = z.array(employeeLookupItemSchema);
