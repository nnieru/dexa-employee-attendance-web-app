import { loginRequestSchema } from '@dexa/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import type { FieldErrors, Resolver } from 'react-hook-form';
import type { z } from 'zod';

// The employee portal is fixed by the app, so the form collects only the credentials. The contract stays
// the validation source; the resolver below only replaces its developer messages with form copy.
export const loginFormSchema = loginRequestSchema.omit({ portal: true });

export type LoginFormValues = z.infer<typeof loginFormSchema>;

const EMAIL_REQUIRED_MESSAGE = 'Enter your company email address.';
const EMAIL_INVALID_MESSAGE = 'Enter a valid company email address.';
const PASSWORD_REQUIRED_MESSAGE = 'Enter your password.';
const PASSWORD_TOO_LONG_MESSAGE = 'Password is too long.';

const contractResolver = zodResolver(loginFormSchema);

export const loginFormResolver: Resolver<LoginFormValues> = async (values, context, options) => {
  const result = await contractResolver(values, context, options);
  if (Object.keys(result.errors).length === 0) return result;
  return {
    values: {},
    errors: toUserFacingErrors(result.errors, values),
  };
};

function toUserFacingErrors(
  errors: FieldErrors<LoginFormValues>,
  values: LoginFormValues,
): FieldErrors<LoginFormValues> {
  const userFacingErrors: FieldErrors<LoginFormValues> = {};
  if (errors.email) {
    const message =
      values.email.trim().length === 0 ? EMAIL_REQUIRED_MESSAGE : EMAIL_INVALID_MESSAGE;
    userFacingErrors.email = { ...errors.email, message };
  }
  if (errors.password) {
    const message =
      values.password.length === 0 ? PASSWORD_REQUIRED_MESSAGE : PASSWORD_TOO_LONG_MESSAGE;
    userFacingErrors.password = { ...errors.password, message };
  }
  return userFacingErrors;
}
