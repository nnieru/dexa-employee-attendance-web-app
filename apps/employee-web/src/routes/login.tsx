import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import {
  LoginForm,
  loginSearchSchema,
  useLogin,
  useSession,
  type LoginFormCopy,
} from '@dexa/session';

const DEFAULT_SIGNED_IN_PATH = '/attendance';

const EMPLOYEE_LOGIN_COPY: LoginFormCopy = {
  heading: 'Sign in',
  description: 'Use your company email and password.',
  submitLabel: 'Sign in',
};

// A signed-in visit has nothing to sign in to, so it goes to the default page, not to a `redirect` target.
export const Route = createFileRoute('/login')({
  validateSearch: loginSearchSchema,
  beforeLoad: async ({ context }) => {
    await context.restoreSession();
    if (context.isSignedIn()) throw redirect({ to: DEFAULT_SIGNED_IN_PATH });
  },
  component: EmployeeLoginPage,
});

function EmployeeLoginPage() {
  const { isSignedIn, session, signIn } = useSession();
  const { redirect: requestedPath } = Route.useSearch();
  const navigate = useNavigate();
  const login = useLogin({
    onSignedIn: (response) => {
      signIn(response.accessToken, response.account);
      // A disallowed account ends the session inside signIn, so there is no session to continue into.
      if (!isSignedIn()) return;
      // The search value was already checked to be a path on this app (loginSearchSchema).
      void navigate({ href: requestedPath ?? DEFAULT_SIGNED_IN_PATH });
    },
  });

  return (
    <LoginForm
      copy={EMPLOYEE_LOGIN_COPY}
      panelClassName="employee-login-panel"
      sessionEndReason={session.status === 'signed-out' ? session.endReason : null}
      errorMessage={login.errorMessage}
      isBusy={login.isBusy}
      onSubmit={login.submitLogin}
    />
  );
}
