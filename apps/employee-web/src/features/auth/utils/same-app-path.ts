// The base only anchors relative parsing for the origin check; no real request uses this origin.
const PLACEHOLDER_ORIGIN = 'https://employee-app.invalid';

/**
 * True only for a path on this app. Rejects absolute URLs, protocol-relative `//host` values, and
 * backslash forms that browsers resolve to another origin, so a crafted `redirect` cannot send the
 * employee to another site (open redirect).
 */
export function isSameAppPath(candidate: string): boolean {
  if (!candidate.startsWith('/')) return false;
  return new URL(candidate, PLACEHOLDER_ORIGIN).origin === PLACEHOLDER_ORIGIN;
}
