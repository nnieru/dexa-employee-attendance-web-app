/**
 * What the route guards need from the session. It is a function, not a boolean: a navigation that starts in
 * the same event as sign-in must already see the new session, before React re-renders the router context.
 */
export type RouterContext = {
  isSignedIn: () => boolean;
};
