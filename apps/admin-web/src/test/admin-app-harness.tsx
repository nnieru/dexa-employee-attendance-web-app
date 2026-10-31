import { QueryClient } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from '@tanstack/react-router';
import { HttpResponse, http } from 'msw';
import { AdminApp } from '../app/admin-app.js';
import { createAppRouter } from '../app/router.js';

export const LOGIN_URL = '/api/v1/auth/login';
export const CURRENT_ACCOUNT_URL = '/api/v1/auth/me';

export const ACCESS_TOKEN = 'access-token-for-tests';
export const HR_ACCOUNT = {
  id: '9b1e4c7d-2f3a-4e5b-8c6d-1a2b3c4d5e6f',
  email: 'sari.wulandari@dexa.test',
  role: 'HR',
};
export const EMPLOYEE_ACCOUNT = {
  id: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13',
  email: 'rina.kusuma@dexa.test',
  role: 'EMPLOYEE',
};
export const VALID_PASSWORD = 'correct-horse-1';

export function loginResponseFor(account: typeof HR_ACCOUNT | typeof EMPLOYEE_ACCOUNT) {
  return { accessToken: ACCESS_TOKEN, tokenType: 'Bearer', expiresIn: 3600, account };
}

export function loginSucceeds(account: typeof HR_ACCOUNT | typeof EMPLOYEE_ACCOUNT = HR_ACCOUNT) {
  return http.post(LOGIN_URL, () => HttpResponse.json(loginResponseFor(account)));
}

// The gateway answers the same 401 for a wrong password and for an EMPLOYEE account on the HR portal.
export function loginRejected() {
  return http.post(LOGIN_URL, () =>
    HttpResponse.json(
      { statusCode: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid credentials.' },
      { status: 401 },
    ),
  );
}

export function accountCheckSucceeds(
  account: typeof HR_ACCOUNT | typeof EMPLOYEE_ACCOUNT = HR_ACCOUNT,
) {
  return http.get(CURRENT_ACCOUNT_URL, () => HttpResponse.json(account));
}

export function accountCheckRejected(code: 'ACCOUNT_DISABLED' | 'UNAUTHORIZED') {
  return http.get(CURRENT_ACCOUNT_URL, () =>
    HttpResponse.json({ statusCode: 401, code, message: 'Unauthorized.' }, { status: 401 }),
  );
}

/**
 * Renders the whole admin app at `initialPath` (which may carry a search string) and waits for the first
 * load. Pass a QueryClient when a test must read the cached account after a session check.
 */
export async function renderAdminApp(initialPath = '/login', queryClient = new QueryClient()) {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [initialPath] }));
  await act(async () => {
    render(<AdminApp queryClient={queryClient} router={router} />);
    await router.load();
  });
  return router;
}

export async function signInWith(
  user: ReturnType<typeof userEvent.setup>,
  email: string,
  password = VALID_PASSWORD,
) {
  await user.type(screen.getByLabelText('Company email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}
