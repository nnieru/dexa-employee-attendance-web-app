import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Alert, PageShell } from '@dexa/ui';
import { useSession } from '../app/session-context.js';
import { LoginForm } from '../features/auth/components/login-form.js';
import { useEmployeeLogin } from '../features/auth/hooks/use-employee-login.js';
import { getSessionEndMessage } from '../features/auth/utils/session-end-message.js';

export const Route = createFileRoute('/login')({ component: EmployeeLoginPage });

function EmployeeLoginPage() {
  const { apiClient, session, signIn } = useSession();
  const navigate = useNavigate();
  const login = useEmployeeLogin({
    apiClient,
    onSignedIn: (response) => {
      signIn(response.accessToken);
      void navigate({ to: '/attendance' });
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
