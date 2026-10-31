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
const EMPLOYEE_ACCOUNT = {
  id: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13',
  email: 'rina.kusuma@dexa.test',
  role: 'EMPLOYEE',
};
const HR_ACCOUNT = {
  id: '9b1e4c7d-2f3a-4e5b-8c6d-1a2b3c4d5e6f',
  email: 'sari.wulandari@dexa.test',
  role: 'HR',
};
const VALID_PASSWORD = 'correct-horse-1';

function loginResponseFor(account: typeof EMPLOYEE_ACCOUNT) {
  return { accessToken: ACCESS_TOKEN, tokenType: 'Bearer', expiresIn: 3600, account };
}

function loginSucceeds(account: typeof EMPLOYEE_ACCOUNT = EMPLOYEE_ACCOUNT) {
  return http.post(LOGIN_URL, () => HttpResponse.json(loginResponseFor(account)));
}

function loginRejected() {
  return http.post(LOGIN_URL, () =>
    HttpResponse.json(
      { statusCode: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid credentials.' },
      { status: 401 },
    ),
  );
}

function accountCheckSucceeds(account: typeof EMPLOYEE_ACCOUNT = EMPLOYEE_ACCOUNT) {
  return http.get(CURRENT_ACCOUNT_URL, () => HttpResponse.json(account));
}

function accountCheckRejected(code: 'ACCOUNT_DISABLED' | 'UNAUTHORIZED') {
  return http.get(CURRENT_ACCOUNT_URL, () =>
    HttpResponse.json({ statusCode: 401, code, message: 'Unauthorized.' }, { status: 401 }),
  );
}

async function renderEmployeeApp(initialPath = '/login') {
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

describe('employee sign-in', () => {
  it('should navigate to Attendance when the employee signs in with valid credentials', async () => {
    mswServer.use(loginSucceeds(), accountCheckSucceeds());
    const user = userEvent.setup();
    const router = await renderEmployeeApp();

    await signInWith(user, EMPLOYEE_ACCOUNT.email);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Attendance' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/attendance');
  });

  it('should accept an HR account on the employee portal when an HR account signs in', async () => {
    let requestBody: unknown;
    mswServer.use(
      http.post(LOGIN_URL, async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json(loginResponseFor(HR_ACCOUNT));
      }),
      accountCheckSucceeds(HR_ACCOUNT),
    );
    const user = userEvent.setup();
    const router = await renderEmployeeApp();

    await signInWith(user, HR_ACCOUNT.email);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Attendance' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/attendance');
    expect(requestBody).toEqual({
      email: HR_ACCOUNT.email,
      password: VALID_PASSWORD,
      portal: 'EMPLOYEE',
    });
  });

  it('should show the generic message and stay on login when the credentials are rejected', async () => {
    mswServer.use(loginRejected());
    const user = userEvent.setup();
    const router = await renderEmployeeApp();

    await signInWith(user, EMPLOYEE_ACCOUNT.email, 'wrong-password-1');

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
        return HttpResponse.json(loginResponseFor(EMPLOYEE_ACCOUNT));
      }),
      accountCheckSucceeds(),
    );
    const user = userEvent.setup();
    await renderEmployeeApp();
    await user.type(screen.getByLabelText('Company email'), EMPLOYEE_ACCOUNT.email);
    await user.type(screen.getByLabelText('Password'), VALID_PASSWORD);
    const signInButton = screen.getByRole('button', { name: 'Sign in' });

    await user.click(signInButton);
    await waitFor(() => expect(signInButton).toBeDisabled());
    await user.click(signInButton);
    releaseLogin();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Attendance' }),
    ).toBeInTheDocument();
    expect(loginRequestCount).toBe(1);
  });

  it('should not send a login request when the email is not a company email', async () => {
    let loginRequestCount = 0;
    mswServer.use(
      http.post(LOGIN_URL, () => {
        loginRequestCount += 1;
        return HttpResponse.json(loginResponseFor(EMPLOYEE_ACCOUNT));
      }),
    );
    const user = userEvent.setup();
    await renderEmployeeApp();

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
        return HttpResponse.json(loginResponseFor(EMPLOYEE_ACCOUNT));
      }),
    );
    const user = userEvent.setup();
    await renderEmployeeApp();

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Enter your company email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(loginRequestCount).toBe(0);
  });

  it('should keep the access token out of localStorage and sessionStorage when the employee signs in', async () => {
    mswServer.use(loginSucceeds(), accountCheckSucceeds());
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const user = userEvent.setup();
    await renderEmployeeApp();

    await signInWith(user, EMPLOYEE_ACCOUNT.email);
    await screen.findByRole('heading', { level: 1, name: 'Attendance' });

    expect(setItemSpy).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});

describe('employee session', () => {
  it('should clear the session and show the deactivation message when the session check reports ACCOUNT_DISABLED', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let accountCheckCount = 0;
    mswServer.use(
      loginSucceeds(),
      http.get(CURRENT_ACCOUNT_URL, () => {
        accountCheckCount += 1;
        if (accountCheckCount === 1) return HttpResponse.json(EMPLOYEE_ACCOUNT);
        return HttpResponse.json(
          { statusCode: 401, code: 'ACCOUNT_DISABLED', message: 'Account is disabled.' },
          { status: 401 },
        );
      }),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const router = await renderEmployeeApp();
    await signInWith(user, EMPLOYEE_ACCOUNT.email);
    await screen.findByRole('heading', { level: 1, name: 'Attendance' });
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
    const router = await renderEmployeeApp();
    await signInWith(user, EMPLOYEE_ACCOUNT.email);
    await screen.findByRole('heading', { level: 1, name: 'Attendance' });

    mswServer.use(accountCheckRejected('UNAUTHORIZED'));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(await screen.findByText('Your session has ended. Sign in again.')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('should check the session again when the window gains focus while the page stays visible', async () => {
    let accountCheckCount = 0;
    mswServer.use(
      loginSucceeds(),
      http.get(CURRENT_ACCOUNT_URL, () => {
        accountCheckCount += 1;
        return HttpResponse.json(EMPLOYEE_ACCOUNT);
      }),
    );
    const user = userEvent.setup();
    await renderEmployeeApp();
    await signInWith(user, EMPLOYEE_ACCOUNT.email);
    await screen.findByRole('heading', { level: 1, name: 'Attendance' });
    expect(accountCheckCount).toBe(1);
    expect(document.visibilityState).toBe('visible');

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => expect(accountCheckCount).toBe(2));
  });
});
