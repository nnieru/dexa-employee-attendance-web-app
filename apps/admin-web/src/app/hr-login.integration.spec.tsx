import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mswServer } from '../test/msw-server.js';
import { createAppRouter } from './router.js';
import { listenForWindowFocus } from './window-focus.js';

const LOGIN_URL = '/api/v1/auth/login';
const CURRENT_ACCOUNT_URL = '/api/v1/auth/me';
const SESSION_CHECK_INTERVAL_MS = 30_000;

const ACCESS_TOKEN = 'access-token-for-tests';
const HR_ACCOUNT = {
  id: '9b1e4c7d-2f3a-4e5b-8c6d-1a2b3c4d5e6f',
  email: 'sari.wulandari@dexa.test',
  role: 'HR',
};
const EMPLOYEE_ACCOUNT = {
  id: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13',
  email: 'rina.kusuma@dexa.test',
  role: 'EMPLOYEE',
};
const VALID_PASSWORD = 'correct-horse-1';

function loginResponseFor(account: typeof HR_ACCOUNT) {
  return { accessToken: ACCESS_TOKEN, tokenType: 'Bearer', expiresIn: 3600, account };
}

function loginSucceeds(account: typeof HR_ACCOUNT = HR_ACCOUNT) {
  return http.post(LOGIN_URL, () => HttpResponse.json(loginResponseFor(account)));
}

// The gateway answers the same 401 for a wrong password and for an EMPLOYEE account on the HR portal.
function loginRejected() {
  return http.post(LOGIN_URL, () =>
    HttpResponse.json(
      { statusCode: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid credentials.' },
      { status: 401 },
    ),
  );
}

function accountCheckSucceeds(account: typeof HR_ACCOUNT = HR_ACCOUNT) {
  return http.get(CURRENT_ACCOUNT_URL, () => HttpResponse.json(account));
}

function accountCheckRejected(code: 'ACCOUNT_DISABLED' | 'UNAUTHORIZED') {
  return http.get(CURRENT_ACCOUNT_URL, () =>
    HttpResponse.json({ statusCode: 401, code, message: 'Unauthorized.' }, { status: 401 }),
  );
}

async function renderHrApp(initialPath = '/login') {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [initialPath] }));
  await act(async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await router.load();
  });
  return router;
}

async function signInWith(
  user: ReturnType<typeof userEvent.setup>,
  email: string,
  password = VALID_PASSWORD,
) {
  await user.type(screen.getByLabelText('Company email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

let stopListeningForWindowFocus: () => void = () => undefined;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  stopListeningForWindowFocus = listenForWindowFocus();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  stopListeningForWindowFocus();
});

describe('HR sign-in', () => {
  it('should navigate to Employees and send the HR portal when the HR account signs in with valid credentials', async () => {
    let requestBody: unknown;
    mswServer.use(
      http.post(LOGIN_URL, async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json(loginResponseFor(HR_ACCOUNT));
      }),
      accountCheckSucceeds(),
    );
    const user = userEvent.setup();
    const router = await renderHrApp();

    await signInWith(user, HR_ACCOUNT.email);

    expect(await screen.findByRole('heading', { level: 1, name: 'Employees' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/employees');
    expect(requestBody).toEqual({
      email: HR_ACCOUNT.email,
      password: VALID_PASSWORD,
      portal: 'HR',
    });
  });

  it('should show the generic message and stay on login when an employee account signs in on the HR portal', async () => {
    mswServer.use(loginRejected());
    const user = userEvent.setup();
    const router = await renderHrApp();

    await signInWith(user, EMPLOYEE_ACCOUNT.email);

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
    expect(router.state.location.pathname).toBe('/login');
  });

  it('should show the generic message and stay on login when the credentials are rejected', async () => {
    mswServer.use(loginRejected());
    const user = userEvent.setup();
    const router = await renderHrApp();

    await signInWith(user, HR_ACCOUNT.email, 'wrong-password-1');

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
    expect(router.state.location.pathname).toBe('/login');
  });

  it('should send one login request when the sign-in button is pressed again while busy', async () => {
    let releaseLogin: () => void = () => undefined;
    const loginGate = new Promise<void>((resolve) => {
      releaseLogin = resolve;
    });
    let loginRequestCount = 0;
    mswServer.use(
      http.post(LOGIN_URL, async () => {
        loginRequestCount += 1;
        await loginGate;
        return HttpResponse.json(loginResponseFor(HR_ACCOUNT));
      }),
      accountCheckSucceeds(),
    );
    const user = userEvent.setup();
    await renderHrApp();
    await user.type(screen.getByLabelText('Company email'), HR_ACCOUNT.email);
    await user.type(screen.getByLabelText('Password'), VALID_PASSWORD);
    const signInButton = screen.getByRole('button', { name: 'Sign in' });

    await user.click(signInButton);
    await waitFor(() => expect(signInButton).toBeDisabled());
    await user.click(signInButton);
    releaseLogin();

    expect(await screen.findByRole('heading', { level: 1, name: 'Employees' })).toBeInTheDocument();
    expect(loginRequestCount).toBe(1);
  });

  it('should not send a login request when the email is not a company email', async () => {
    let loginRequestCount = 0;
    mswServer.use(
      http.post(LOGIN_URL, () => {
        loginRequestCount += 1;
        return HttpResponse.json(loginResponseFor(HR_ACCOUNT));
      }),
    );
    const user = userEvent.setup();
    await renderHrApp();

    await signInWith(user, 'not-an-email');

    expect(await screen.findByText('Enter a valid company email address.')).toBeInTheDocument();
    expect(screen.getByLabelText('Company email')).toHaveAttribute('aria-invalid', 'true');
    expect(loginRequestCount).toBe(0);
  });

  it('should show the required-field messages and not send a login request when both fields are empty', async () => {
    let loginRequestCount = 0;
    mswServer.use(
      http.post(LOGIN_URL, () => {
        loginRequestCount += 1;
        return HttpResponse.json(loginResponseFor(HR_ACCOUNT));
      }),
    );
    const user = userEvent.setup();
    await renderHrApp();

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Enter your company email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(loginRequestCount).toBe(0);
  });

  it('should keep the access token out of localStorage and sessionStorage when the HR account signs in', async () => {
    mswServer.use(loginSucceeds(), accountCheckSucceeds());
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const user = userEvent.setup();
    await renderHrApp();

    await signInWith(user, HR_ACCOUNT.email);
    await screen.findByRole('heading', { level: 1, name: 'Employees' });

    expect(setItemSpy).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});

describe('HR session', () => {
  it('should clear the session and show the deactivation message when the session check reports ACCOUNT_DISABLED', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let accountCheckCount = 0;
    mswServer.use(
      loginSucceeds(),
      http.get(CURRENT_ACCOUNT_URL, () => {
        accountCheckCount += 1;
        if (accountCheckCount === 1) return HttpResponse.json(HR_ACCOUNT);
        return HttpResponse.json(
          { statusCode: 401, code: 'ACCOUNT_DISABLED', message: 'Account is disabled.' },
          { status: 401 },
        );
      }),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const router = await renderHrApp();
    await signInWith(user, HR_ACCOUNT.email);
    await screen.findByRole('heading', { level: 1, name: 'Employees' });
    await waitFor(() => expect(accountCheckCount).toBe(1));

    await act(async () => {
      vi.advanceTimersByTime(SESSION_CHECK_INTERVAL_MS);
    });

    expect(await screen.findByText('Your account has been deactivated.')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(accountCheckCount).toBe(2);
  });

  it('should send the user to login with the session-ended message when the session check reports UNAUTHORIZED', async () => {
    mswServer.use(loginSucceeds(), accountCheckSucceeds());
    const user = userEvent.setup();
    const router = await renderHrApp();
    await signInWith(user, HR_ACCOUNT.email);
    await screen.findByRole('heading', { level: 1, name: 'Employees' });

    mswServer.use(accountCheckRejected('UNAUTHORIZED'));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(await screen.findByText('Your session has ended. Sign in again.')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('should keep the HR session when the session check reports INVALID_CREDENTIALS', async () => {
    mswServer.use(loginSucceeds(), accountCheckSucceeds());
    const user = userEvent.setup();
    const router = await renderHrApp();
    await signInWith(user, HR_ACCOUNT.email);
    await screen.findByRole('heading', { level: 1, name: 'Employees' });

    let rejectedCheckCount = 0;
    mswServer.use(
      http.get(CURRENT_ACCOUNT_URL, () => {
        rejectedCheckCount += 1;
        return HttpResponse.json(
          { statusCode: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid credentials.' },
          { status: 401 },
        );
      }),
    );
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => expect(rejectedCheckCount).toBe(1));
    expect(router.state.location.pathname).toBe('/employees');
    expect(screen.queryByText('Your session has ended. Sign in again.')).not.toBeInTheDocument();
  });

  it('should check the session again when the window gains focus while the page stays visible', async () => {
    let accountCheckCount = 0;
    mswServer.use(
      loginSucceeds(),
      http.get(CURRENT_ACCOUNT_URL, () => {
        accountCheckCount += 1;
        return HttpResponse.json(HR_ACCOUNT);
      }),
    );
    const user = userEvent.setup();
    await renderHrApp();
    await signInWith(user, HR_ACCOUNT.email);
    await screen.findByRole('heading', { level: 1, name: 'Employees' });
    expect(accountCheckCount).toBe(1);
    expect(document.visibilityState).toBe('visible');

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => expect(accountCheckCount).toBe(2));
  });
});
