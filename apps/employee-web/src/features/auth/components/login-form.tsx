import { useForm } from 'react-hook-form';
import { Alert, Button, TextField } from '@dexa/ui';
import { loginFormResolver, type LoginFormValues } from '../types/login-form.schema.js';

type LoginFormProps = {
  errorMessage: string | null;
  isBusy: boolean;
  onSubmit: (credentials: LoginFormValues) => void;
};

export function LoginForm({ errorMessage, isBusy, onSubmit }: LoginFormProps) {
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<LoginFormValues>({
    resolver: loginFormResolver,
    defaultValues: { email: '', password: '' },
  });

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)}>
      {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
      <TextField
        label="Company email"
        type="email"
        autoComplete="username"
        inputMode="email"
        error={errors.email?.message}
        {...register('email')}
      />
      <TextField
        label="Password"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register('password')}
      />
      <Button type="submit" isLoading={isBusy}>
        Sign in
      </Button>
    </form>
  );
}
