import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { Alert, PageShell } from '@dexa/ui';
import { useSession } from '../app/session-context.js';
import { LoginForm } from '../features/auth/components/login-form.js';
import { useEmployeeLogin } from '../features/auth/hooks/use-employee-login.js';
import { loginSearchSchema } from '../features/auth/types/login-search.schema.js';
import { getSessionEndMessage } from '../features/auth/utils/session-end-message.js';

const DEFAULT_SIGNED_IN_PATH = '/attendance';

// A signed-in visit has nothing to sign in to, so it goes to the default page, not to a `redirect` target.
export const Route = createFileRoute('/login')({
  validateSearch: loginSearchSchema,
  beforeLoad: ({ context }) => {
    if (context.isSignedIn()) throw redirect({ to: DEFAULT_SIGNED_IN_PATH });
  },
  component: EmployeeLoginPage,
});

function EmployeeLoginPage() {
  const { apiClient, session, signIn } = useSession();
  const { redirect: requestedPath } = Route.useSearch();
  const navigate = useNavigate();
  const login = useEmployeeLogin({
    apiClient,
    onSignedIn: (response) => {
      signIn(response.accessToken);
      // The search value was already checked to be a path on this app (login-search.schema.ts).
      void navigate({ href: requestedPath ?? DEFAULT_SIGNED_IN_PATH });
    },
  });
  const endReason = session.status === 'signed-out' ? session.endReason : null;

  return (
    <PageShell layout="form" title="Sign in" description="Use your company email and password.">
      <section className="employee-login-panel">
        {endReason && <Alert variant="error">{getSessionEndMessage(endReason)}</Alert>}
        <LoginForm
          errorMessage={login.errorMessage}
          isBusy={login.isBusy}
          onSubmit={login.submitLogin}
        />
      </section>
    </PageShell>
  );
}
