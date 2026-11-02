/**
 * What the route guards need from the session. It is a function, not a boolean: a navigation that starts in
 * the same event as sign-in must already see the new session, before React re-renders the router context.
 * The restore is a promise, so a guard can await the session-restore attempt of a hard refresh before
 * it decides. A plain type, so this package does not depend on the router.
 */
export type RouterContext = {
  isSignedIn: () => boolean;
  restoreSession: () => Promise<void>;
};
