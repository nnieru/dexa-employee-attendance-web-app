import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Portal, Role } from '@dexa/contracts';
import { mswServer } from './test/msw-server.js';
import {
  CURRENT_ACCOUNT_URL,
  LOGIN_URL,
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

function loginReturns(account: typeof HR_ACCOUNT | typeof EMPLOYEE_ACCOUNT) {
  return http.post(LOGIN_URL, () =>
    HttpResponse.json({
      accessToken: ACCESS_TOKEN,
      tokenType: 'Bearer',
      expiresIn: 3600,
      account,
    }),
  );
}

function accountCheckReturns(account: typeof HR_ACCOUNT | typeof EMPLOYEE_ACCOUNT) {
  return http.get(CURRENT_ACCOUNT_URL, () => HttpResponse.json(account));
}

function accountCheckRejected(code: 'ACCOUNT_DISABLED' | 'UNAUTHORIZED') {
  return http.get(CURRENT_ACCOUNT_URL, () =>
    HttpResponse.json({ statusCode: 401, code, message: 'Unauthorized.' }, { status: 401 }),
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

describe('session sign-in through the shared login form', () => {
  it('should show the signed-in state and send the configured portal when an allowed role signs in', async () => {
    let requestBody: unknown;
    mswServer.use(
      http.post(LOGIN_URL, async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json({
          accessToken: ACCESS_TOKEN,
          tokenType: 'Bearer',
          expiresIn: 3600,
          account: HR_ACCOUNT,
        });
      }),
      accountCheckReturns(HR_ACCOUNT),
    );
    const user = userEvent.setup();
    renderSessionLogin({ portal: Portal.HR, allowedRoles: [Role.HR] });

    await signInWith(user, HR_ACCOUNT.email);

    expect(await screen.findByText('Signed in')).toBeInTheDocument();
    expect(requestBody).toEqual({
      email: HR_ACCOUNT.email,
      password: 'correct-horse-1',
      portal: 'HR',
    });
  });

  it('should show the generic message and keep no session when a role the app does not allow signs in', async () => {
    let accountCheckCount = 0;
    mswServer.use(
      loginReturns(EMPLOYEE_ACCOUNT),
      http.get(CURRENT_ACCOUNT_URL, () => {
        accountCheckCount += 1;
        return HttpResponse.json(EMPLOYEE_ACCOUNT);
      }),
    );
    const user = userEvent.setup();
    renderSessionLogin({ portal: Portal.HR, allowedRoles: [Role.HR] });

    await signInWith(user, EMPLOYEE_ACCOUNT.email);

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
    expect(screen.queryByText('Signed in')).not.toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(accountCheckCount).toBe(0);
  });
});

describe('session checks', () => {
  it('should end the session with the deactivation message when the session check reports ACCOUNT_DISABLED', async () => {
    const onSessionEnded = vi.fn();
    let accountCheckCount = 0;
    mswServer.use(
      loginReturns(HR_ACCOUNT),
      http.get(CURRENT_ACCOUNT_URL, () => {
        accountCheckCount += 1;
        if (accountCheckCount === 1) return HttpResponse.json(HR_ACCOUNT);
        return HttpResponse.json(
          { statusCode: 401, code: 'ACCOUNT_DISABLED', message: 'Account is disabled.' },
          { status: 401 },
        );
      }),
    );
    const user = userEvent.setup();
    renderSessionLogin({ portal: Portal.HR, allowedRoles: [Role.HR], onSessionEnded });
    await signInWith(user, HR_ACCOUNT.email);
    await screen.findByText('Signed in');
    await waitFor(() => expect(accountCheckCount).toBe(1));

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(await screen.findByText('Your account has been deactivated.')).toBeInTheDocument();
    expect(onSessionEnded).toHaveBeenCalledTimes(1);
  });

  it('should end the session with the session-ended message when the session check returns a role the app does not allow', async () => {
    mswServer.use(loginReturns(HR_ACCOUNT), accountCheckReturns(HR_ACCOUNT));
    const user = userEvent.setup();
    renderSessionLogin({ portal: Portal.HR, allowedRoles: [Role.HR] });
    await signInWith(user, HR_ACCOUNT.email);
    await screen.findByText('Signed in');

    mswServer.use(accountCheckReturns(EMPLOYEE_ACCOUNT));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(await screen.findByText('Your session has ended. Sign in again.')).toBeInTheDocument();
  });

  it('should end the session with the session-ended message when the session check reports UNAUTHORIZED', async () => {
    mswServer.use(loginReturns(HR_ACCOUNT), accountCheckReturns(HR_ACCOUNT));
    const user = userEvent.setup();
    renderSessionLogin({ portal: Portal.HR, allowedRoles: [Role.HR] });
    await signInWith(user, HR_ACCOUNT.email);
    await screen.findByText('Signed in');

    mswServer.use(accountCheckRejected('UNAUTHORIZED'));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(await screen.findByText('Your session has ended. Sign in again.')).toBeInTheDocument();
  });
});
