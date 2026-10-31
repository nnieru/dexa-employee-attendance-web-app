import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Alert, PageShell } from '@dexa/ui';
import { useSession } from '../app/session-context.js';
import { LoginForm } from '../features/auth/components/login-form.js';
import { useHrLogin } from '../features/auth/hooks/use-hr-login.js';
import { getSessionEndMessage } from '../features/auth/utils/session-end-message.js';

export const Route = createFileRoute('/login')({ component: HrLoginPage });

function HrLoginPage() {
  const { apiClient, session, signIn } = useSession();
  const navigate = useNavigate();
  const login = useHrLogin({
    apiClient,
    onSignedIn: (response) => {
      signIn(response.accessToken);
      void navigate({ to: '/employees' });
    },
  });
  const endReason = session.status === 'signed-out' ? session.endReason : null;

  return (
    <PageShell
      layout="form"
      title="HR sign in"
      description="Use your company email and password to open the HR Portal."
    >
      <section className="hr-login-panel">
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
