import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import type { AppRouter } from './router.js';
import { SessionProvider } from './session-provider.js';
import { useSession } from './session-context.js';

type EmployeeAppProps = {
  queryClient: QueryClient;
  router: AppRouter;
};

/**
 * Composes the providers in the order the guards need: the session exists above the router, so the
 * router's context can read it. The app and the tests both render this component.
 */
export function EmployeeApp({ queryClient, router }: EmployeeAppProps) {
  const navigateToLogin = useCallback(() => {
    void router.navigate({ to: '/login' });
  }, [router]);

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider onSessionEnded={navigateToLogin}>
        <SessionRouter router={router} />
      </SessionProvider>
    </QueryClientProvider>
  );
}

function SessionRouter({ router }: { router: AppRouter }) {
  const { isSignedIn } = useSession();
  const routerContext = useMemo(() => ({ isSignedIn }), [isSignedIn]);
  return <RouterProvider router={router} context={routerContext} />;
}
