import { API_PREFIX } from '@dexa/contracts';

const PHOTO_URL_PREFIX = `/${API_PREFIX}/`;

/**
 * Turns the protected `photoUrl` from the profile into a path for the shared client, which already carries the
 * API prefix. Any other value returns null, so the Bearer token is never sent to an address the API did not name.
 */
export function toOwnPhotoRequestPath(photoUrl: string): string | null {
  if (!photoUrl.startsWith(PHOTO_URL_PREFIX)) return null;
  return `/${photoUrl.slice(PHOTO_URL_PREFIX.length)}`;
}
