import { expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell, type AppShellProps } from './app-shell.js';
import type { AppShellLinkProps, AppShellNavItem } from './app-shell-navigation.js';

const employeeNavItems: ReadonlyArray<AppShellNavItem> = [
  { id: 'attendance', label: 'Attendance', icon: 'clock', href: '/attendance', isActive: true },
  { id: 'history', label: 'History', icon: 'history', href: '/history', isActive: false },
  { id: 'profile', label: 'Profile', icon: 'user', href: '/profile', isActive: false },
];

function renderShell(overrides: Partial<AppShellProps> = {}) {
  const onLogout = vi.fn();
  const props: AppShellProps = {
    brand: 'Attendance',
    children: <p>Page content</p>,
    navItems: employeeNavItems,
    onLogout,
    ...overrides,
  };
  render(<AppShell {...props} />);
  return { onLogout };
}

/** The shell renders the rail and the bottom bar; both hold every item, and CSS shows only one. */
function getItemLinks(name: string): HTMLElement[] {
  return screen.getAllByRole('link', { name });
}

it('should mark the active item with aria-current="page" and leave the others unmarked', () => {
  renderShell();

  const activeLinks = getItemLinks('Attendance');
  expect(activeLinks).toHaveLength(2);
  activeLinks.forEach((link) => expect(link).toHaveAttribute('aria-current', 'page'));

  getItemLinks('History').forEach((link) => expect(link).not.toHaveAttribute('aria-current'));
  getItemLinks('Profile').forEach((link) => expect(link).not.toHaveAttribute('aria-current'));
});

it('should render every item label in both navigation landmarks', () => {
  renderShell();

  const navigations = screen.getAllByRole('navigation', { name: 'Main' });
  expect(navigations).toHaveLength(2);
  for (const navigation of navigations) {
    expect(within(navigation).getByRole('link', { name: 'Attendance' })).toBeInTheDocument();
    expect(within(navigation).getByRole('link', { name: 'History' })).toBeInTheDocument();
    expect(within(navigation).getByRole('link', { name: 'Profile' })).toBeInTheDocument();
    expect(within(navigation).getByRole('button', { name: 'Logout' })).toBeInTheDocument();
  }
});

it('should include the count in the accessible name when an item has a count', () => {
  renderShell({
    navItems: [
      {
        id: 'approvals',
        label: 'Approvals',
        icon: 'review',
        href: '/approvals',
        isActive: true,
        count: { value: 3, unit: 'pending' },
      },
    ],
  });

  expect(getItemLinks('Approvals, 3 pending')).toHaveLength(2);
});

it('should call onLogout when the Logout item is activated', async () => {
  const user = userEvent.setup();
  const { onLogout } = renderShell();

  const logoutButtons = screen.getAllByRole('button', { name: 'Logout' });
  expect(logoutButtons).toHaveLength(2);
  for (const logoutButton of logoutButtons) {
    await user.click(logoutButton);
  }

  expect(onLogout).toHaveBeenCalledTimes(2);
});

it('should point the skip link at the main region when it is used', () => {
  renderShell();

  const skipLink = screen.getByRole('link', { name: 'Skip to main content' });
  const main = screen.getByRole('main');
  expect(main.id).not.toBe('');
  expect(skipLink).toHaveAttribute('href', `#${main.id}`);
  expect(main).toHaveTextContent('Page content');
});

it('should render items through renderLink with the href and aria-current when provided', () => {
  const renderLink = vi.fn(
    ({ href, className, children, 'aria-current': ariaCurrent }: AppShellLinkProps) => (
      <a data-testid="app-link" href={href} className={className} aria-current={ariaCurrent}>
        {children}
      </a>
    ),
  );
  renderShell({ renderLink });

  expect(renderLink).toHaveBeenCalledWith(
    expect.objectContaining({ href: '/attendance', 'aria-current': 'page' }),
  );
  expect(renderLink).toHaveBeenCalledWith(expect.objectContaining({ href: '/history' }));
  expect(screen.getAllByTestId('app-link')).toHaveLength(6);
});

it('should call onSelect and render a button for an item without an href', async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  renderShell({
    navItems: [{ id: 'draft', label: 'Draft', icon: 'pencil', onSelect, isActive: false }],
  });

  const draftButtons = screen.getAllByRole('button', { name: 'Draft' });
  expect(draftButtons).toHaveLength(2);
  for (const draftButton of draftButtons) {
    await user.click(draftButton);
  }

  expect(onSelect).toHaveBeenCalledTimes(2);
});
