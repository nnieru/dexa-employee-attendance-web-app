import { useForm } from 'react-hook-form';
import { Alert, Button, PageShell, TextField } from '@dexa/ui';
import type { SessionEndReason } from '../auth/session-end-reason.js';
import { getSessionEndMessage } from '../auth/session-end-message.js';
import { loginFormResolver, type LoginFormValues } from '../auth/login-form.schema.js';

export type LoginFormCopy = {
  heading: string;
  description: string;
  submitLabel: string;
};

type LoginFormProps = {
  copy: LoginFormCopy;
  /** Class of the panel around the form. Each app styles its own panel. */
  panelClassName: string;
  /** Set when the session ended, so the login page explains why it is showing. */
  sessionEndReason: SessionEndReason | null;
  errorMessage: string | null;
  isBusy: boolean;
  onSubmit: (credentials: LoginFormValues) => void;
};

/** The login page body: heading, the session-ended notice, and the credentials form. */
export function LoginForm({
  copy,
  panelClassName,
  sessionEndReason,
  errorMessage,
  isBusy,
  onSubmit,
}: LoginFormProps) {
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<LoginFormValues>({
    resolver: loginFormResolver,
    defaultValues: { email: '', password: '' },
  });

  return (
    <PageShell layout="form" title={copy.heading} description={copy.description}>
      <section className={panelClassName}>
        {sessionEndReason && (
          <Alert variant="error">{getSessionEndMessage(sessionEndReason)}</Alert>
        )}
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
            {copy.submitLabel}
          </Button>
        </form>
      </section>
    </PageShell>
  );
}
