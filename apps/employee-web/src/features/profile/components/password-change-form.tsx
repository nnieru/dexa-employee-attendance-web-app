import { Alert, Button, TextField } from '@dexa/ui';
import { useForm } from 'react-hook-form';
import { useChangeOwnPassword } from '../hooks/use-change-own-password.js';
import { getProfileErrorMessage } from '../utils/get-profile-error-message.js';
import { isCurrentPasswordIncorrect } from '../utils/is-current-password-incorrect.js';
import {
  CURRENT_PASSWORD_INCORRECT_MESSAGE,
  changePasswordFormResolver,
  toChangePasswordRequest,
  type ChangePasswordFormValues,
} from '../utils/change-password-form.schema.js';

const EMPTY_PASSWORD_FORM: ChangePasswordFormValues = {
  currentPassword: '',
  newPassword: '',
  confirmNewPassword: '',
};

// All three fields are cleared after a save, so no password stays on screen. A refused current password keeps
// the typed values, so the employee only corrects the one field.
export function PasswordChangeForm() {
  const passwordMutation = useChangeOwnPassword();
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm<ChangePasswordFormValues>({
    resolver: changePasswordFormResolver,
    defaultValues: EMPTY_PASSWORD_FORM,
  });

  function submitPasswordChange(values: ChangePasswordFormValues) {
    if (passwordMutation.isPending) return;
    passwordMutation.mutate(toChangePasswordRequest(values), {
      onSuccess: () => {
        reset(EMPTY_PASSWORD_FORM);
      },
      onError: (error) => {
        if (!isCurrentPasswordIncorrect(error)) return;
        setError('currentPassword', {
          type: 'server',
          message: CURRENT_PASSWORD_INCORRECT_MESSAGE,
        });
      },
    });
  }

  const generalError =
    passwordMutation.error && !isCurrentPasswordIncorrect(passwordMutation.error)
      ? getProfileErrorMessage(passwordMutation.error)
      : null;

  return (
    <form
      className="employee-profile-form"
      noValidate
      onSubmit={handleSubmit(submitPasswordChange)}
    >
      <TextField
        label="Current password"
        type="password"
        autoComplete="current-password"
        error={errors.currentPassword?.message}
        {...register('currentPassword')}
      />
      <TextField
        label="New password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters, with letters and numbers."
        error={errors.newPassword?.message}
        {...register('newPassword')}
      />
      <TextField
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        error={errors.confirmNewPassword?.message}
        {...register('confirmNewPassword')}
      />
      {generalError && <Alert variant="error">{generalError}</Alert>}
      {passwordMutation.isSuccess && <Alert variant="success">Password changed.</Alert>}
      <Button type="submit" isLoading={passwordMutation.isPending}>
        Change password
      </Button>
    </form>
  );
}
