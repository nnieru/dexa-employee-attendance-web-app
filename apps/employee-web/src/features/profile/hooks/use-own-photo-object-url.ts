import { skipToken, useQuery } from '@tanstack/react-query';
import { useSession } from '@dexa/session';
import { getOwnPhoto } from '../api/get-own-photo.js';
import { profileQueryKeys } from '../api/profile-query-keys.js';
import { toOwnPhotoRequestPath } from '../utils/to-own-photo-request-path.js';
import { useObjectUrl } from './use-object-url.js';

/**
 * Returns a local object URL for the owner's photo, or null when there is no photo, it is not yet loaded, or
 * its request failed. A failure is not an error state: the caller falls back to initials (PRO-1).
 */
export function useOwnPhotoObjectUrl(photoUrl: string | null): string | null {
  const { apiClient } = useSession();
  const photoRequestPath = photoUrl === null ? null : toOwnPhotoRequestPath(photoUrl);
  const photoQuery = useQuery({
    queryKey: profileQueryKeys.ownPhoto(photoRequestPath),
    queryFn: photoRequestPath === null ? skipToken : () => getOwnPhoto(apiClient, photoRequestPath),
    // The photo URL does not change when the photo does, so the bytes are kept until the profile keys are
    // invalidated after an upload. Window focus does not refetch them.
    staleTime: Infinity,
    retry: false,
  });
  return useObjectUrl(photoQuery.data ?? null);
}
