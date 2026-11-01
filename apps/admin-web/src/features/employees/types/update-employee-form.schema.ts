import { passwordSchema } from '@dexa/contracts';
import { z } from 'zod';
import { createEmployeeFormSchema } from './create-employee-form.schema.js';

// The shared fields reuse the create form's rules and messages. The email is read-only here, and the role is not
// part of the update contract, so neither is in the form.
const sharedFieldsSchema = createEmployeeFormSchema.pick({
  name: true,
  positionId: true,
  employeeStatusId: true,
  phoneNumber: true,
});

// An empty password means "keep the current password". Any entered password must follow the same policy as create.
function checkOptionalPassword(value: string, context: z.RefinementCtx): void {
  if (value.length === 0) return;
  const result = passwordSchema.safeParse(value);
  if (result.success) return;
  for (const issue of result.error.issues) {
    context.addIssue({ code: 'custom', message: issue.message });
  }
}

export const updateEmployeeFormSchema = sharedFieldsSchema.extend({
  newPassword: z.string().superRefine(checkOptionalPassword),
});

export type UpdateEmployeeFormValues = z.infer<typeof updateEmployeeFormSchema>;
