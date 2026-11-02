import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { API_PREFIX, type Portal, type Role } from '@dexa/contracts';
import { useLogin } from '../auth/use-login.js';
import { LoginForm, type LoginFormCopy } from '../components/login-form.js';
import { SessionProvider } from '../session-provider.js';
import { useSession } from '../session-context.js';
import type { SessionConfig } from '../session-config.js';

export const TEST_API_BASE_URL = `/${API_PREFIX}`;
export const LOGIN_URL = `${TEST_API_BASE_URL}/auth/login`;
export const CURRENT_ACCOUNT_URL = `${TEST_API_BASE_URL}/auth/me`;
export const REFRESH_URL = `${TEST_API_BASE_URL}/auth/refresh`;
export const LOGOUT_URL = `${TEST_API_BASE_URL}/auth/logout`;

export const ACCESS_TOKEN = 'access-token-for-tests';
export const VALID_PASSWORD = 'correct-horse-1';

const TEST_LOGIN_COPY: LoginFormCopy = {
  heading: 'Test sign in',
  description: 'Use your company email and password.',
  submitLabel: 'Sign in',
};

export type SessionHarnessOptions = {
  portal: Portal;
  allowedRoles: ReadonlyArray<Role>;
  onSessionEnded?: () => void;
};

/** A login page built only from the shared pieces, so the test exercises the package's own wiring. */
function TestLoginPage() {
  const { session, signIn } = useSession();
  const login = useLogin({
    onSignedIn: (response) => signIn(response.accessToken, response.account),
  });

  if (session.status === 'signed-in') return <p>Signed in</p>;
  return (
    <LoginForm
      copy={TEST_LOGIN_COPY}
      panelClassName="test-login-panel"
      sessionEndReason={session.endReason}
      errorMessage={login.errorMessage}
      isBusy={login.isBusy}
      onSubmit={login.submitLogin}
    />
  );
}

export function renderSessionLogin({
  portal,
  allowedRoles,
  onSessionEnded = () => undefined,
}: SessionHarnessOptions) {
  const config: SessionConfig = {
    portal,
    allowedRoles,
    apiBaseUrl: TEST_API_BASE_URL,
    onSessionEnded,
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SessionProvider config={config}>
        <TestLoginPage />
      </SessionProvider>
    </QueryClientProvider>,
  );
}

export async function signInWith(user: ReturnType<typeof userEvent.setup>, email: string) {
  await user.type(screen.getByLabelText('Company email'), email);
  await user.type(screen.getByLabelText('Password'), VALID_PASSWORD);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

/**
 * A page shaped like a router guard: an explicit restore action (what beforeLoad awaits) and the
 * session it produced, plus the logout the signed-in shell offers.
 */
function TestRestorePage() {
  const { session, restoreSession, signOut } = useSession();
  return (
    <div>
      {session.status === 'signed-in' ? <p>Signed in</p> : <p>Signed out</p>}
      <button type="button" onClick={() => void restoreSession()}>
        Restore
      </button>
      <button type="button" onClick={signOut}>
        Sign out
      </button>
    </div>
  );
}

export function renderSessionRestore({
  portal,
  allowedRoles,
  onSessionEnded = () => undefined,
}: SessionHarnessOptions) {
  const config: SessionConfig = {
    portal,
    allowedRoles,
    apiBaseUrl: TEST_API_BASE_URL,
    onSessionEnded,
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SessionProvider config={config}>
        <TestRestorePage />
      </SessionProvider>
    </QueryClientProvider>,
  );
}
