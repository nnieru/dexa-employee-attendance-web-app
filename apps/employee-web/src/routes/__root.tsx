import { Outlet, createRootRoute } from '@tanstack/react-router';
import { SessionProvider } from '../app/session-provider.js';

export const Route = createRootRoute({ component: RootLayout });

function RootLayout() {
  return (
    <SessionProvider>
      <Outlet />
    </SessionProvider>
  );
}
