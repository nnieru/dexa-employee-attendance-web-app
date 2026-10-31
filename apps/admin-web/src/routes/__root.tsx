import { Outlet, createRootRouteWithContext } from '@tanstack/react-router';
import type { RouterContext } from '@dexa/session';

export const Route = createRootRouteWithContext<RouterContext>()({ component: RootLayout });

// The session provider sits above the router (app/admin-app.tsx), so the root only renders children.
function RootLayout() {
  return <Outlet />;
}
