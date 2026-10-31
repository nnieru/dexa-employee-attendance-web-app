import type { OwnProfile } from '@dexa/contracts';
import { Avatar, StatusLabel } from '@dexa/ui';
import { useOwnPhotoObjectUrl } from '../hooks/use-own-photo-object-url.js';
import { getProfileStatusDisplay } from '../utils/get-profile-status-display.js';

type ProfileHeaderProps = {
  profile: OwnProfile;
};

export function ProfileHeader({ profile }: ProfileHeaderProps) {
  const photoObjectUrl = useOwnPhotoObjectUrl(profile.photoUrl);
  const statusDisplay = getProfileStatusDisplay(profile.profileStatus);
  // The photo and its alt text are passed together or not at all, as the Avatar contract requires.
  const avatarPhoto =
    photoObjectUrl === null
      ? { photoUrl: null }
      : { photoUrl: photoObjectUrl, photoAlt: `Profile photo of ${profile.name}` };

  return (
    <div className="employee-profile-header">
      <Avatar name={profile.name} size="profile" {...avatarPhoto} />
      <div className="employee-profile-header__summary">
        <h2 className="employee-profile-header__name">{profile.name}</h2>
        <p className="employee-profile-header__position">{profile.position.name}</p>
        <StatusLabel tone={statusDisplay.tone}>{statusDisplay.text}</StatusLabel>
      </div>
    </div>
  );
}
