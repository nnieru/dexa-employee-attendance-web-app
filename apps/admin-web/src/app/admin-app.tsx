import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { Portal, Role } from '@dexa/contracts';
import { ToastProvider } from '@dexa/ui';
import { SessionProvider, useSession, type SessionConfig } from '@dexa/session';
import { useCallback, useMemo } from 'react';
import { API_BASE_URL } from './api-base-url.js';
import type { AppRouter } from './router.js';

type AdminAppProps = {
  queryClient: QueryClient;
  router: AppRouter;
};

/**
 * Composes the providers in the order the guards need: the session exists above the router, so the
 * router's context can read it. The app and the tests both render this component.
 */
export function AdminApp({ queryClient, router }: AdminAppProps) {
  const navigateToLogin = useCallback(() => {
    void router.navigate({ to: '/login' });
  }, [router]);

  const sessionConfig = useMemo<SessionConfig>(
    () => ({
      portal: Portal.HR,
      // The HR portal accepts HR accounts only (PRD AUTH-3, contracts Portal).
      allowedRoles: [Role.HR],
      apiBaseUrl: API_BASE_URL,
      onSessionEnded: navigateToLogin,
    }),
    [navigateToLogin],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider config={sessionConfig}>
        <ToastProvider>
          <SessionRouter router={router} />
        </ToastProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}

function SessionRouter({ router }: { router: AppRouter }) {
  const { isSignedIn } = useSession();
  const routerContext = useMemo(() => ({ isSignedIn }), [isSignedIn]);
  return <RouterProvider router={router} context={routerContext} />;
}
