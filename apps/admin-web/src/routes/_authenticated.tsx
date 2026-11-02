import { createFileRoute, Link, Outlet, redirect, useMatchRoute } from '@tanstack/react-router';
import { AppShell, type AppShellRenderLink } from '@dexa/ui';
import { ADMIN_NAVIGATION } from '../app/admin-navigation.js';
import { API_BASE_URL } from '../app/api-base-url.js';
import { useSession } from '@dexa/session';
import { useNotificationStream } from '../features/notifications/hooks/use-notification-stream.js';
import { LiveUpdatesStatus } from '../features/notifications/components/live-updates-status.js';
import { useUnreadNotificationCount } from '../features/notifications/hooks/use-unread-notification-count.js';
import { getUnreadNavigationCount } from '../features/notifications/utils/unread-navigation-count.js';

const HR_BRAND_NAME = 'Dexa HR';
const NOTIFICATIONS_NAVIGATION_ID = 'notifications';

// Pathless layout: every HR page under it needs a signed-in HR session. The API enforces
// authorization; this guard only decides which screen the HR user sees.
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
  // Mounted once for the whole signed-in shell, so one stream serves every HR page.
  const liveUpdatesState = useNotificationStream({ apiBaseUrl: API_BASE_URL });
  const unreadCount = useUnreadNotificationCount();
  const navItems = ADMIN_NAVIGATION.map((entry) => ({
    id: entry.id,
    label: entry.label,
    icon: entry.icon,
    href: entry.to,
    // Fuzzy, so Employees stays current on the add page under it (/employees/new).
    isActive: matchRoute({ to: entry.to, fuzzy: true }) !== false,
    count:
      entry.id === NOTIFICATIONS_NAVIGATION_ID
        ? getUnreadNavigationCount(unreadCount.data?.unreadCount)
        : undefined,
  }));

  return (
    <AppShell
      brand={HR_BRAND_NAME}
      navItems={navItems}
      onLogout={signOut}
      renderLink={renderNavigationLink}
    >
      <LiveUpdatesStatus state={liveUpdatesState} />
      <Outlet />
    </AppShell>
  );
}
