import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mswServer } from '../test/msw-server.js';
import {
  CURRENT_ACCOUNT_URL,
  EMPLOYEE_ACCOUNT,
  HR_ACCOUNT,
  LOGIN_URL,
  VALID_PASSWORD,
  accountCheckRejected,
  accountCheckSucceeds,
  loginRejected,
  loginResponseFor,
  loginSucceeds,
  renderAdminApp,
  signInWith,
} from '../test/admin-app-harness.js';
import { listenForWindowFocus } from '@dexa/session';
import { employeeListSucceeds, photoThumbnailsSucceeds } from '../test/employee-list-fixtures.js';

const SESSION_CHECK_INTERVAL_MS = 30_000;

let stopListeningForWindowFocus: () => void = () => undefined;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  mswServer.use(employeeListSucceeds(), photoThumbnailsSucceeds());
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
    const router = await renderAdminApp();

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
    const router = await renderAdminApp();

    await signInWith(user, EMPLOYEE_ACCOUNT.email);

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
    expect(router.state.location.pathname).toBe('/login');
  });

  it('should show the generic message and stay on login when the credentials are rejected', async () => {
    mswServer.use(loginRejected());
    const user = userEvent.setup();
    const router = await renderAdminApp();

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
    await renderAdminApp();
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

  it('should keep no session and stay on login when the login returns an account that is not HR', async () => {
    let releaseLogin: () => void = () => undefined;
    const loginGate = new Promise<void>((resolve) => {
      releaseLogin = resolve;
    });
    let accountCheckCount = 0;
    mswServer.use(
      http.post(LOGIN_URL, async () => {
        await loginGate;
        return HttpResponse.json(loginResponseFor(EMPLOYEE_ACCOUNT));
      }),
      http.get(CURRENT_ACCOUNT_URL, () => {
        accountCheckCount += 1;
        return HttpResponse.json(EMPLOYEE_ACCOUNT);
      }),
    );
    const user = userEvent.setup();
    const router = await renderAdminApp();
    await signInWith(user, EMPLOYEE_ACCOUNT.email);
    const signInButton = screen.getByRole('button', { name: 'Sign in' });
    await waitFor(() => expect(signInButton).toBeDisabled());

    releaseLogin();
    await waitFor(() => expect(signInButton).toBeEnabled());

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
    expect(router.state.location.pathname).toBe('/login');
    await act(async () => {
      await router.navigate({ href: '/employees' });
    });
    expect(router.state.location.search).toEqual({ redirect: '/employees' });
    expect(accountCheckCount).toBe(0);
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
    await renderAdminApp();

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
    await renderAdminApp();

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Enter your company email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(loginRequestCount).toBe(0);
  });

  it('should keep the access token out of localStorage and sessionStorage when the HR account signs in', async () => {
    mswServer.use(loginSucceeds(), accountCheckSucceeds());
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const user = userEvent.setup();
    await renderAdminApp();

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
    const router = await renderAdminApp();
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
    const router = await renderAdminApp();
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
    const router = await renderAdminApp();
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
    await renderAdminApp();
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
