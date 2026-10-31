import type { OwnProfile } from '@dexa/contracts';
import { PageShell } from '@dexa/ui';
import type { UseQueryResult } from '@tanstack/react-query';
import { useOwnProfile } from '../hooks/use-own-profile.js';
import { ProfileDetails } from './profile-details.js';
import { ProfileLoadError } from './profile-load-error.js';
import { ProfileSkeleton } from './profile-skeleton.js';

const PROFILE_DESCRIPTION = 'Name, email, and position are managed by HR.';

export function ProfilePage() {
  const profileQuery = useOwnProfile();
  return (
    <PageShell as="div" title="Profile" description={PROFILE_DESCRIPTION}>
      <ProfileContent profileQuery={profileQuery} />
    </PageShell>
  );
}

// Kept profile data stays on screen while a refetch runs (DESIGN §9 refreshing); the error and skeleton
// states show only when there is no profile to keep.
function ProfileContent({ profileQuery }: { profileQuery: UseQueryResult<OwnProfile> }) {
  if (profileQuery.data) return <ProfileDetails profile={profileQuery.data} />;
  if (profileQuery.isError) {
    return (
      <ProfileLoadError
        isRetrying={profileQuery.isFetching}
        onRetry={() => {
          void profileQuery.refetch();
        }}
      />
    );
  }
  return <ProfileSkeleton />;
}
