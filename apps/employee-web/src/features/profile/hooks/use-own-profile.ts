import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { OwnProfile } from '@dexa/contracts';
import { useSession } from '@dexa/session';
import { getOwnProfile } from '../api/get-own-profile.js';
import { profileQueryKeys } from '../api/profile-query-keys.js';

// A failure is shown with a retry action (DESIGN §9), so the query does not retry on its own; the page would
// otherwise wait through several backoff delays before it showed the error.
export function useOwnProfile(): UseQueryResult<OwnProfile> {
  const { apiClient } = useSession();
  return useQuery({
    queryKey: profileQueryKeys.ownProfile(),
    queryFn: () => getOwnProfile(apiClient),
    retry: false,
  });
}
