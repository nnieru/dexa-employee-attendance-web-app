import type { Portal, Role } from '@dexa/contracts';

/**
 * What differs between the web apps. Each app supplies it once to SessionProvider. The package never reads
 * environment variables and never names an app route.
 */
export type SessionConfig = {
  /** The portal the login request names: EMPLOYEE or HR. */
  portal: Portal;
  /** Roles whose accounts this app keeps a session for. Any other role ends the session. */
  allowedRoles: ReadonlyArray<Role>;
  /** Base URL of the API gateway. The app reads its own environment and passes the value in. */
  apiBaseUrl: string;
  /** Called after the session ends so the app can send the user to login. */
  onSessionEnded: () => void;
};
