import { Alert, Button, TextField } from '@dexa/ui';
import { useForm } from 'react-hook-form';
import { useUpdateOwnPhone } from '../hooks/use-update-own-phone.js';
import { getProfileErrorMessage } from '../utils/get-profile-error-message.js';
import { isServerValidationFailure } from '../utils/is-server-validation-failure.js';
import {
  PHONE_NUMBER_FORMAT_MESSAGE,
  phoneNumberFormResolver,
  toUpdateOwnProfileRequest,
  type PhoneNumberFormValues,
} from '../utils/phone-number-form.schema.js';

const NOT_RECORDED_YET_TEXT = 'Not recorded yet';

type PhoneNumberFormProps = {
  phoneNumber: string | null;
};

// The phone is the only profile field the employee edits (PRO-2). The server's answer to the saved values
// comes back in the form's own field, and the success message is separate from the photo's.
export function PhoneNumberForm({ phoneNumber }: PhoneNumberFormProps) {
  const phoneMutation = useUpdateOwnPhone();
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm<PhoneNumberFormValues>({
    resolver: phoneNumberFormResolver,
    defaultValues: { phoneNumber: phoneNumber ?? '' },
  });

  function submitPhoneNumber(values: PhoneNumberFormValues) {
    if (phoneMutation.isPending) return;
    phoneMutation.mutate(toUpdateOwnProfileRequest(values), {
      onSuccess: (savedProfile) => {
        reset({ phoneNumber: savedProfile.phoneNumber ?? '' });
      },
      onError: (error) => {
        if (!isServerValidationFailure(error)) return;
        setError('phoneNumber', { type: 'server', message: PHONE_NUMBER_FORMAT_MESSAGE });
      },
    });
  }

  const generalError =
    phoneMutation.error && !isServerValidationFailure(phoneMutation.error)
      ? getProfileErrorMessage(phoneMutation.error)
      : null;

  return (
    <form className="employee-profile-form" noValidate onSubmit={handleSubmit(submitPhoneNumber)}>
      <TextField
        label="Phone number"
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        hint={phoneNumber === null ? NOT_RECORDED_YET_TEXT : undefined}
        error={errors.phoneNumber?.message}
        {...register('phoneNumber')}
      />
      {generalError && <Alert variant="error">{generalError}</Alert>}
      {phoneMutation.isSuccess && <Alert variant="success">Phone number saved.</Alert>}
      <Button type="submit" isLoading={phoneMutation.isPending}>
        Save phone number
      </Button>
    </form>
  );
}
