import { z } from 'zod';
import { accountIdSchema } from '../auth/account-lookup.schema.js';

// The outcome of each step that an HR update can save, in the order the steps run.
// true: the step committed, or the account already had the requested state, and Auth or the database confirmed it.
// false: the step did not run, or it failed in a way that saved nothing.
// null: the step was not attempted for this request, or its outcome is unconfirmed (for example a timeout that may
// have applied the change). null never means that a write was rolled back, because no rollback spans the services.
export const employeeUpdateIncompleteDetailsSchema = z.strictObject({
  accountId: accountIdSchema,
  profileSaved: z.boolean(),
  accountStatusSaved: z.boolean().nullable(),
  passwordReset: z.boolean().nullable(),
});

export type EmployeeUpdateIncompleteDetails = z.infer<typeof employeeUpdateIncompleteDetailsSchema>;
