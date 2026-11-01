import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mswServer } from '../test/msw-server.js';
import {
  EMPLOYEE_ACCOUNT,
  accountCheckSucceeds,
  loginSucceeds,
  ownProfileSucceeds,
  renderEmployeeApp,
  signInWith,
} from '../test/employee-app-harness.js';
import { listenForWindowFocus } from '@dexa/session';

let stopListeningForWindowFocus: () => void = () => undefined;

beforeEach(() => {
  mswServer.use(loginSucceeds(), accountCheckSucceeds(), ownProfileSucceeds());
  stopListeningForWindowFocus = listenForWindowFocus();
});

afterEach(() => {
  stopListeningForWindowFocus();
});

async function signInFrom(path: string) {
  const user = userEvent.setup();
  const router = await renderEmployeeApp(path);
  await signInWith(user, EMPLOYEE_ACCOUNT.email);
  return { user, router };
}

/** The shell renders the rail and the bottom bar; the rail is the first "Main" landmark in DOM order. */
function getEmployeeNavigation(): HTMLElement {
  const [railNavigation] = screen.getAllByRole('navigation', { name: 'Main' });
  if (!railNavigation) throw new Error('The employee navigation was not rendered');
  return railNavigation;
}

describe('employee route guards', () => {
  it('should send a signed-out employee from the home route to login when no session exists', async () => {
    const router = await renderEmployeeApp('/');

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('should send a signed-in employee from the home route to Attendance when the session exists', async () => {
    const { router } = await signInFrom('/login');
    await screen.findByRole('heading', { level: 1, name: 'Attendance' });

    await act(async () => {
      await router.navigate({ href: '/' });
    });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Attendance' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/attendance');
  });

  it('should redirect to login with the requested page when a signed-out employee opens Profile', async () => {
    const router = await renderEmployeeApp('/profile');

    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toEqual({ redirect: '/profile' });
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
  });

  it('should show the requested page after sign-in when the employee was sent to login from Profile', async () => {
    const { router } = await signInFrom('/profile');

    expect(await screen.findByRole('heading', { level: 1, name: 'Profile' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/profile');
  });

  it('should ignore an absolute-URL redirect and show Attendance after sign-in when the redirect names another site', async () => {
    const { router } = await signInFrom('/login?redirect=https%3A%2F%2Fevil.example%2Fsteal');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Attendance' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/attendance');
  });

  it('should send a signed-in employee from login to Attendance when login is opened again', async () => {
    const { router } = await signInFrom('/login');
    await screen.findByRole('heading', { level: 1, name: 'Attendance' });

    await act(async () => {
      await router.navigate({ to: '/login' });
    });

    expect(router.state.location.pathname).toBe('/attendance');
  });

  it('should show the five navigation items in order when the employee is signed in', async () => {
    await signInFrom('/login');
    await screen.findByRole('heading', { level: 1, name: 'Attendance' });

    const navigation = within(getEmployeeNavigation());
    const linkNames = navigation.getAllByRole('link').map((link) => link.textContent);
    expect(linkNames).toEqual(['Attendance', 'History', 'Requests', 'Profile']);
    expect(navigation.getByRole('button', { name: 'Logout' })).toBeInTheDocument();
  });

  it('should mark Attendance as the current page when the employee is on Attendance', async () => {
    await signInFrom('/login');
    await screen.findByRole('heading', { level: 1, name: 'Attendance' });

    const navigation = within(getEmployeeNavigation());
    expect(navigation.getByRole('link', { name: 'Attendance' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    for (const label of ['History', 'Requests', 'Profile']) {
      expect(navigation.getByRole('link', { name: label })).not.toHaveAttribute('aria-current');
    }
  });

  it('should mark History as the current page when the employee opens History from the navigation', async () => {
    const { user, router } = await signInFrom('/login');
    await screen.findByRole('heading', { level: 1, name: 'Attendance' });

    await user.click(within(getEmployeeNavigation()).getByRole('link', { name: 'History' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'History' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/history');
    const navigation = within(getEmployeeNavigation());
    expect(navigation.getByRole('link', { name: 'History' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(navigation.getByRole('link', { name: 'Attendance' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it.each([['/requests/corrections/new', 'Request correction']])(
    'should show the coming-soon state on %s when the employee is signed in',
    async (path, title) => {
      const { router } = await signInFrom('/login');
      await screen.findByRole('heading', { level: 1, name: 'Attendance' });

      await act(async () => {
        await router.navigate({ href: path });
      });

      expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
      expect(screen.getByText('Coming soon')).toBeInTheDocument();
    },
  );

  it('should redirect to login with the overtime request form requested when a signed-out employee opens it', async () => {
    const router = await renderEmployeeApp('/requests/overtime/new');

    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toEqual({ redirect: '/requests/overtime/new' });
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
  });

  it('should keep Requests marked as the current page when the employee is on the overtime request form', async () => {
    const { router } = await signInFrom('/login');
    await screen.findByRole('heading', { level: 1, name: 'Attendance' });

    await act(async () => {
      await router.navigate({ href: '/requests/overtime/new' });
    });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Request overtime' }),
    ).toBeInTheDocument();
    const navigation = within(getEmployeeNavigation());
    expect(navigation.getByRole('link', { name: 'Requests' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(navigation.getByRole('link', { name: 'Attendance' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('should return to login with no session-ended message when the employee presses Logout', async () => {
    const { user, router } = await signInFrom('/login');
    await screen.findByRole('heading', { level: 1, name: 'Attendance' });

    await user.click(within(getEmployeeNavigation()).getByRole('button', { name: 'Logout' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should redirect a protected page to login when the employee opens it after Logout', async () => {
    const { user, router } = await signInFrom('/login');
    await screen.findByRole('heading', { level: 1, name: 'Attendance' });
    await user.click(within(getEmployeeNavigation()).getByRole('button', { name: 'Logout' }));
    await screen.findByRole('heading', { level: 1, name: 'Sign in' });

    await act(async () => {
      await router.navigate({ href: '/attendance' });
    });

    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toEqual({ redirect: '/attendance' });
  });
});
