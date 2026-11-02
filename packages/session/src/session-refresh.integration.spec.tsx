import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Portal, Role } from '@dexa/contracts';
import { mswServer } from './test/msw-server.js';
import {
  CURRENT_ACCOUNT_URL,
  LOGIN_URL,
  LOGOUT_URL,
  REFRESH_URL,
  renderSessionRestore,
  renderSessionLogin,
  signInWith,
} from './test/session-test-harness.js';
import { listenForWindowFocus } from './window-focus.js';

const HR_ACCOUNT = {
  id: '9b1e4c7d-2f3a-4e5b-8c6d-1a2b3c4d5e6f',
  email: 'sari.wulandari@dexa.test',
  role: Role.HR,
};
const EMPLOYEE_ACCOUNT = {
  id: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13',
  email: 'rina.kusuma@dexa.test',
  role: Role.EMPLOYEE,
};
const ACCESS_TOKEN = 'access-token-for-tests';
const NEXT_ACCESS_TOKEN = 'access-token-after-refresh';

function refreshReturns(account: typeof HR_ACCOUNT | typeof EMPLOYEE_ACCOUNT) {
  return http.post(REFRESH_URL, () =>
    HttpResponse.json({
      accessToken: NEXT_ACCESS_TOKEN,
      tokenType: 'Bearer',
      expiresIn: 3600,
      account,
    }),
  );
}

function refreshRejected() {
  return http.post(REFRESH_URL, () =>
    HttpResponse.json(
      { statusCode: 401, code: 'UNAUTHORIZED', message: 'Sign in to continue.' },
      { status: 401 },
    ),
  );
}

let stopListeningForWindowFocus: () => void = () => undefined;

beforeEach(() => {
  stopListeningForWindowFocus = listenForWindowFocus();
});

afterEach(() => {
  vi.restoreAllMocks();
  stopListeningForWindowFocus();
});

describe('session restore from the refresh cookie', () => {
  it('should sign in from the refresh answer when the cookie holds a session of an allowed role', async () => {
    let refreshCount = 0;
    mswServer.use(
      http.post(REFRESH_URL, () => {
        refreshCount += 1;
        return HttpResponse.json({
          accessToken: NEXT_ACCESS_TOKEN,
          tokenType: 'Bearer',
          expiresIn: 3600,
          account: HR_ACCOUNT,
        });
      }),
      http.get(CURRENT_ACCOUNT_URL, () => HttpResponse.json(HR_ACCOUNT)),
    );
    const user = userEvent.setup();
    renderSessionRestore({ portal: Portal.HR, allowedRoles: [Role.HR] });
    expect(screen.getByText('Signed out')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Restore' }));
    // A second call after the first one keeps the one-attempt-per-load rule.
    await user.click(screen.getByRole('button', { name: 'Restore' }));

    expect(await screen.findByText('Signed in')).toBeInTheDocument();
    expect(refreshCount).toBe(1);
  });

  it('should stay signed out when the refresh cookie answer is refused', async () => {
    mswServer.use(refreshRejected());
    const user = userEvent.setup();
    renderSessionRestore({ portal: Portal.HR, allowedRoles: [Role.HR] });

    await user.click(screen.getByRole('button', { name: 'Restore' }));

    await expect(screen.findByText('Signed out')).resolves.toBeInTheDocument();
  });

  it('should keep no session when the refresh answer names a role the app does not allow', async () => {
    mswServer.use(refreshReturns(EMPLOYEE_ACCOUNT));
    const onSessionEnded = vi.fn();
    const user = userEvent.setup();
    renderSessionRestore({ portal: Portal.HR, allowedRoles: [Role.HR], onSessionEnded });

    await user.click(screen.getByRole('button', { name: 'Restore' }));

    await expect(screen.findByText('Signed out')).resolves.toBeInTheDocument();
    expect(onSessionEnded).toHaveBeenCalledTimes(1);
  });

  it('should drop the refresh cookie through logout and end the local session when the user signs out', async () => {
    let logoutCount = 0;
    mswServer.use(
      refreshReturns(HR_ACCOUNT),
      http.post(LOGOUT_URL, () => {
        logoutCount += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderSessionRestore({ portal: Portal.HR, allowedRoles: [Role.HR] });
    await user.click(screen.getByRole('button', { name: 'Restore' }));
    await screen.findByText('Signed in');

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    await expect(screen.findByText('Signed out')).resolves.toBeInTheDocument();
    await vi.waitFor(() => expect(logoutCount).toBe(1));
  });
});

describe('access-token expiry during a signed-in session', () => {
  it('should refresh once and retry the request when the token has expired', async () => {
    let accountCheckCount = 0;
    let refreshCount = 0;
    mswServer.use(
      http.post(LOGIN_URL, () =>
        HttpResponse.json({
          accessToken: ACCESS_TOKEN,
          tokenType: 'Bearer',
          expiresIn: 3600,
          account: HR_ACCOUNT,
        }),
      ),
      http.get(CURRENT_ACCOUNT_URL, () => {
        accountCheckCount += 1;
        if (accountCheckCount === 1) {
          return HttpResponse.json(
            { statusCode: 401, code: 'UNAUTHORIZED', message: 'Unauthorized.' },
            { status: 401 },
          );
        }
        return HttpResponse.json(HR_ACCOUNT);
      }),
      http.post(REFRESH_URL, () => {
        refreshCount += 1;
        return HttpResponse.json({
          accessToken: NEXT_ACCESS_TOKEN,
          tokenType: 'Bearer',
          expiresIn: 3600,
          account: HR_ACCOUNT,
        });
      }),
    );
    const user = userEvent.setup();
    renderSessionLogin({ portal: Portal.HR, allowedRoles: [Role.HR] });
    await signInWith(user, HR_ACCOUNT.email);
    await screen.findByText('Signed in');

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    await expect(screen.findByText('Signed in')).resolves.toBeInTheDocument();
    await vi.waitFor(() => expect(refreshCount).toBe(1));
    // The refused check plus the retried one; later interval checks may add more.
    await vi.waitFor(() => expect(accountCheckCount).toBeGreaterThanOrEqual(2));
  });

  it('should end the session when the refresh itself is refused', async () => {
    mswServer.use(
      http.post(LOGIN_URL, () =>
        HttpResponse.json({
          accessToken: ACCESS_TOKEN,
          tokenType: 'Bearer',
          expiresIn: 3600,
          account: HR_ACCOUNT,
        }),
      ),
      accountCheckRejected(),
      refreshRejected(),
    );
    const onSessionEnded = vi.fn();
    const user = userEvent.setup();
    renderSessionLogin({ portal: Portal.HR, allowedRoles: [Role.HR], onSessionEnded });
    await signInWith(user, HR_ACCOUNT.email);
    await screen.findByText('Signed in');

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(await screen.findByText('Your session has ended. Sign in again.')).toBeInTheDocument();
    expect(onSessionEnded).toHaveBeenCalledTimes(1);
  });
});

function accountCheckRejected() {
  return http.get(CURRENT_ACCOUNT_URL, () =>
    HttpResponse.json(
      { statusCode: 401, code: 'UNAUTHORIZED', message: 'Unauthorized.' },
      { status: 401 },
    ),
  );
}
