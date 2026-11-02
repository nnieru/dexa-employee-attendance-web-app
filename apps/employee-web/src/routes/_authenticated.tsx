import { createFileRoute, Link, Outlet, redirect, useMatchRoute } from '@tanstack/react-router';
import { AppShell, type AppShellRenderLink } from '@dexa/ui';
import { EMPLOYEE_NAVIGATION } from '../app/employee-navigation.js';
import { useSession } from '@dexa/session';

const EMPLOYEE_BRAND_NAME = 'Dexa Employee';

// Pathless layout: every employee page under it needs a signed-in session (AUTH-3). The API enforces
// authorization; this guard only decides which screen the employee sees.
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context, location }) => {
    // A hard refresh restores the session from the refresh-token cookie before the route is chosen.
    await context.restoreSession();
    if (context.isSignedIn()) return;
    throw redirect({ to: '/login', search: { redirect: location.href } });
  },
  component: AuthenticatedLayout,
});

const renderNavigationLink: AppShellRenderLink = ({
  href,
  className,
  children,
  'aria-current': ariaCurrent,
}) => (
  <Link to={href} className={className} aria-current={ariaCurrent}>
    {children}
  </Link>
);

function AuthenticatedLayout() {
  const { signOut } = useSession();
  const matchRoute = useMatchRoute();
  const navItems = EMPLOYEE_NAVIGATION.map((entry) => ({
    id: entry.id,
    label: entry.label,
    icon: entry.icon,
    href: entry.to,
    // Fuzzy, so a page under a section (for example /requests/overtime/new) keeps its section highlighted.
    isActive: matchRoute({ to: entry.to, fuzzy: true }) !== false,
  }));

  return (
    <AppShell
      brand={EMPLOYEE_BRAND_NAME}
      navItems={navItems}
      onLogout={signOut}
      renderLink={renderNavigationLink}
    >
      <Outlet />
    </AppShell>
  );
}
