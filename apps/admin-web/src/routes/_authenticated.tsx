import { createFileRoute, Link, Outlet, redirect, useMatchRoute } from '@tanstack/react-router';
import { AppShell, type AppShellRenderLink } from '@dexa/ui';
import { ADMIN_NAVIGATION } from '../app/admin-navigation.js';
import { useSession } from '@dexa/session';

const HR_BRAND_NAME = 'Dexa HR';

// Pathless layout: every HR page under it needs a signed-in HR session (AUTH-3). The API enforces
// authorization; this guard only decides which screen the HR user sees.
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context, location }) => {
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
  const navItems = ADMIN_NAVIGATION.map((entry) => ({
    id: entry.id,
    label: entry.label,
    icon: entry.icon,
    href: entry.to,
    isActive: matchRoute({ to: entry.to }) !== false,
  }));

  return (
    <AppShell
      brand={HR_BRAND_NAME}
      navItems={navItems}
      onLogout={signOut}
      renderLink={renderNavigationLink}
    >
      <Outlet />
    </AppShell>
  );
}
