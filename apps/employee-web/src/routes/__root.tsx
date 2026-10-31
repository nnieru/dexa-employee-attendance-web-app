import { Outlet, createRootRouteWithContext } from '@tanstack/react-router';
import type { RouterContext } from '../app/router-context.js';

export const Route = createRootRouteWithContext<RouterContext>()({ component: RootLayout });

// The session provider sits above the router (app/employee-app.tsx), so the root only renders children.
function RootLayout() {
  return <Outlet />;
}
