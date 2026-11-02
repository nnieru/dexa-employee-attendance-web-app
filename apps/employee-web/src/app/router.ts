import { createRouter, type RouterHistory } from '@tanstack/react-router';
import { routeTree } from '../routeTree.gen.js';
import type { RouterContext } from '@dexa/session';

// Before the session provider supplies the real check, nothing is signed in and no restore is pending,
// so protected routes redirect to login without waiting.
const SIGNED_OUT_ROUTER_CONTEXT: RouterContext = {
  isSignedIn: () => false,
  restoreSession: () => Promise.resolve(),
};

export function createAppRouter(history?: RouterHistory) {
  return createRouter({ routeTree, history, context: SIGNED_OUT_ROUTER_CONTEXT });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

export const router = createAppRouter();

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
