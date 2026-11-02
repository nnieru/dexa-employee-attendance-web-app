import {
  changePasswordRequestSchema,
  passwordSchema,
  type ChangePasswordRequest,
} from '@dexa/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

export const CURRENT_PASSWORD_REQUIRED_MESSAGE = 'Enter your current password.';
export const PASSWORD_MISMATCH_MESSAGE = 'The new passwords do not match.';
export const CURRENT_PASSWORD_INCORRECT_MESSAGE = 'The current password is incorrect.';

// The new password is checked by the shared contract, so the form names the same rule the server enforces
// The current password only has to be present: it may predate the policy, so the policy does not apply.
export const changePasswordFormSchema = z
  .object({
    currentPassword: z.string().min(1, { error: CURRENT_PASSWORD_REQUIRED_MESSAGE }),
    newPassword: passwordSchema,
    confirmNewPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmNewPassword, {
    error: PASSWORD_MISMATCH_MESSAGE,
    path: ['confirmNewPassword'],
  });

export type ChangePasswordFormValues = z.infer<typeof changePasswordFormSchema>;

export const changePasswordFormResolver = zodResolver(changePasswordFormSchema);

// The confirmation is a form-only field, so it is left out of the request (the contract is strict).
export function toChangePasswordRequest(values: ChangePasswordFormValues): ChangePasswordRequest {
  return changePasswordRequestSchema.parse({
    currentPassword: values.currentPassword,
    newPassword: values.newPassword,
  });
}
