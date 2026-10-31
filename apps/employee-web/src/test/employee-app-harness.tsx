import { QueryClient } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from '@tanstack/react-router';
import { HttpResponse, http } from 'msw';
import { EmployeeApp } from '../app/employee-app.js';
import { createAppRouter } from '../app/router.js';

export const LOGIN_URL = '/api/v1/auth/login';
export const CURRENT_ACCOUNT_URL = '/api/v1/auth/me';

export const ACCESS_TOKEN = 'access-token-for-tests';
export const EMPLOYEE_ACCOUNT = {
  id: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13',
  email: 'rina.kusuma@dexa.test',
  role: 'EMPLOYEE',
};
export const HR_ACCOUNT = {
  id: '9b1e4c7d-2f3a-4e5b-8c6d-1a2b3c4d5e6f',
  email: 'sari.wulandari@dexa.test',
  role: 'HR',
};
export const VALID_PASSWORD = 'correct-horse-1';

export const OWN_PROFILE_URL = '/api/v1/employees/me';
export const OWN_PHOTO_URL = '/api/v1/employees/me/photo';
type OwnProfileFixture = {
  accountId: string;
  name: string;
  email: string;
  position: { code: string; name: string };
  phoneNumber: string | null;
  photoUrl: string | null;
  profileStatus: 'COMPLETE' | 'INCOMPLETE';
};

export const OWN_PROFILE: OwnProfileFixture = {
  accountId: EMPLOYEE_ACCOUNT.id,
  name: 'Rina Kusuma',
  email: 'rina.kusuma@dexa.test',
  position: { code: 'FULLSTACK_DEVELOPER', name: 'Fullstack Developer' },
  phoneNumber: '+6281234567890',
  photoUrl: null,
  profileStatus: 'COMPLETE',
};

export function ownProfileSucceeds(profile: OwnProfileFixture = OWN_PROFILE) {
  return http.get(OWN_PROFILE_URL, () => HttpResponse.json(profile));
}

export function loginResponseFor(account: typeof EMPLOYEE_ACCOUNT) {
  return { accessToken: ACCESS_TOKEN, tokenType: 'Bearer', expiresIn: 3600, account };
}

export function loginSucceeds(account: typeof EMPLOYEE_ACCOUNT = EMPLOYEE_ACCOUNT) {
  return http.post(LOGIN_URL, () => HttpResponse.json(loginResponseFor(account)));
}

export function loginRejected() {
  return http.post(LOGIN_URL, () =>
    HttpResponse.json(
      { statusCode: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid credentials.' },
      { status: 401 },
    ),
  );
}

export function accountCheckSucceeds(account: typeof EMPLOYEE_ACCOUNT = EMPLOYEE_ACCOUNT) {
  return http.get(CURRENT_ACCOUNT_URL, () => HttpResponse.json(account));
}

export function accountCheckRejected(code: 'ACCOUNT_DISABLED' | 'UNAUTHORIZED') {
  return http.get(CURRENT_ACCOUNT_URL, () =>
    HttpResponse.json({ statusCode: 401, code, message: 'Unauthorized.' }, { status: 401 }),
  );
}

/** Renders the whole employee app at `initialPath` (which may carry a search string) and waits for the first load. */
export async function renderEmployeeApp(initialPath = '/login') {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [initialPath] }));
  await act(async () => {
    render(<EmployeeApp queryClient={new QueryClient()} router={router} />);
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
