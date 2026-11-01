import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { mswServer } from '../test/msw-server.js';
import {
  CURRENT_ACCOUNT_URL,
  EMPLOYEE_ACCOUNT,
  HR_ACCOUNT,
  accountCheckSucceeds,
  loginSucceeds,
  renderAdminApp,
  signInWith,
} from '../test/admin-app-harness.js';
import { listenForWindowFocus } from '@dexa/session';
import { employeeListSucceeds, photoThumbnailsSucceeds } from '../test/employee-list-fixtures.js';

let stopListeningForWindowFocus: () => void = () => undefined;

beforeEach(() => {
  mswServer.use(
    loginSucceeds(),
    accountCheckSucceeds(),
    employeeListSucceeds(),
    photoThumbnailsSucceeds(),
  );
  stopListeningForWindowFocus = listenForWindowFocus();
});

afterEach(() => {
  stopListeningForWindowFocus();
});

async function signInFrom(path: string) {
  const user = userEvent.setup();
  const router = await renderAdminApp(path);
  await signInWith(user, HR_ACCOUNT.email);
  return { user, router };
}

/** The shell renders the rail and the bottom bar; the rail is the first "Main" landmark in DOM order. */
function getAdminNavigation(): HTMLElement {
  const [railNavigation] = screen.getAllByRole('navigation', { name: 'Main' });
  if (!railNavigation) throw new Error('The HR navigation was not rendered');
  return railNavigation;
}

describe('HR route guards', () => {
  it('should send a signed-out HR user from the home route to login when no session exists', async () => {
    const router = await renderAdminApp('/');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'HR sign in' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('should send a signed-in HR user from the home route to Employees when the session exists', async () => {
    const { router } = await signInFrom('/login');
    await screen.findByRole('heading', { level: 1, name: 'Employees' });

    await act(async () => {
      await router.navigate({ href: '/' });
    });

    expect(await screen.findByRole('heading', { level: 1, name: 'Employees' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/employees');
  });

  it('should redirect to login with the requested page when a signed-out HR user opens Approvals', async () => {
    const router = await renderAdminApp('/approvals');

    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toEqual({ redirect: '/approvals' });
    expect(screen.getByRole('heading', { level: 1, name: 'HR sign in' })).toBeInTheDocument();
  });

  it('should show the requested page after sign-in when the HR user was sent to login from Approvals', async () => {
    const { router } = await signInFrom('/approvals');

    expect(await screen.findByRole('heading', { level: 1, name: 'Approvals' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/approvals');
  });

  it('should ignore an absolute-URL redirect and show Employees after sign-in when the redirect names another site', async () => {
    const { router } = await signInFrom('/login?redirect=https%3A%2F%2Fevil.example%2Fsteal');

    expect(await screen.findByRole('heading', { level: 1, name: 'Employees' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/employees');
  });

  it('should send a signed-in HR user from login to Employees when login is opened again', async () => {
    const { router } = await signInFrom('/login');
    await screen.findByRole('heading', { level: 1, name: 'Employees' });

    await act(async () => {
      await router.navigate({ to: '/login' });
    });

    expect(router.state.location.pathname).toBe('/employees');
  });

  it('should end the session and show the session-ended message when a session check returns a non-HR account', async () => {
    const user = userEvent.setup();
    const router = await renderAdminApp('/login');
    await signInWith(user, HR_ACCOUNT.email);
    await screen.findByRole('heading', { level: 1, name: 'Employees' });

    let accountCheckCount = 0;
    mswServer.use(
      http.get(CURRENT_ACCOUNT_URL, () => {
        accountCheckCount += 1;
        return HttpResponse.json(EMPLOYEE_ACCOUNT);
      }),
    );
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(await screen.findByText('Your session has ended. Sign in again.')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(accountCheckCount).toBe(1);

    await act(async () => {
      await router.navigate({ href: '/approvals' });
    });

    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toEqual({ redirect: '/approvals' });
    expect(accountCheckCount).toBe(1);
  });

  it('should show the five navigation items in order when the HR user is signed in', async () => {
    await signInFrom('/login');
    await screen.findByRole('heading', { level: 1, name: 'Employees' });

    const navigation = within(getAdminNavigation());
    const linkNames = navigation.getAllByRole('link').map((link) => link.textContent);
    expect(linkNames).toEqual([
      'Employees',
      'Attendance',
      'Approvals',
      'Schedule',
      'Notifications',
    ]);
    expect(navigation.getByRole('button', { name: 'Logout' })).toBeInTheDocument();
  });

  it('should mark Employees as the current page when the HR user is on Employees', async () => {
    await signInFrom('/login');
    await screen.findByRole('heading', { level: 1, name: 'Employees' });

    const navigation = within(getAdminNavigation());
    expect(navigation.getByRole('link', { name: 'Employees' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    for (const label of ['Attendance', 'Approvals', 'Schedule', 'Notifications']) {
      expect(navigation.getByRole('link', { name: label })).not.toHaveAttribute('aria-current');
    }
  });

  it('should mark Approvals as the current page when the HR user opens Approvals from the navigation', async () => {
    const { user, router } = await signInFrom('/login');
    await screen.findByRole('heading', { level: 1, name: 'Employees' });

    await user.click(within(getAdminNavigation()).getByRole('link', { name: 'Approvals' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Approvals' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/approvals');
    const navigation = within(getAdminNavigation());
    expect(navigation.getByRole('link', { name: 'Approvals' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(navigation.getByRole('link', { name: 'Employees' })).not.toHaveAttribute('aria-current');
  });

  it.each([['/approvals', 'Approvals']])(
    'should show the coming-soon state on %s when the HR user is signed in',
    async (path, title) => {
      const { router } = await signInFrom('/login');
      await screen.findByRole('heading', { level: 1, name: 'Employees' });

      await act(async () => {
        await router.navigate({ href: path });
      });

      expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
      expect(screen.getByText('Coming soon')).toBeInTheDocument();
    },
  );

  it('should show the employee list on Employees when the HR user is signed in', async () => {
    await signInFrom('/login');

    expect(await screen.findByRole('heading', { level: 1, name: 'Employees' })).toBeInTheDocument();
    expect(await screen.findByText('No employees yet.')).toBeInTheDocument();
  });

  it('should return to login with no session-ended message when the HR user presses Logout', async () => {
    const { user, router } = await signInFrom('/login');
    await screen.findByRole('heading', { level: 1, name: 'Employees' });

    await user.click(within(getAdminNavigation()).getByRole('button', { name: 'Logout' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'HR sign in' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should redirect a protected page to login when the HR user opens it after Logout', async () => {
    const { user, router } = await signInFrom('/login');
    await screen.findByRole('heading', { level: 1, name: 'Employees' });
    await user.click(within(getAdminNavigation()).getByRole('button', { name: 'Logout' }));
    await screen.findByRole('heading', { level: 1, name: 'HR sign in' });

    await act(async () => {
      await router.navigate({ href: '/attendance' });
    });

    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toEqual({ redirect: '/attendance' });
  });
});
