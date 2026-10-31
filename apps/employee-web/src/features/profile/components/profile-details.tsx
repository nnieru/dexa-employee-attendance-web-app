import type { OwnProfile } from '@dexa/contracts';
import { TextField } from '@dexa/ui';
import { ProfileHeader } from './profile-header.js';

const NOT_RECORDED_YET_TEXT = 'Not recorded yet';

type ProfileDetailsProps = {
  profile: OwnProfile;
};

// Name, email and position are read-only for the employee (PRO-3). Phone is shown here; editing it is a
// separate task, so the field is read-only for now.
export function ProfileDetails({ profile }: ProfileDetailsProps) {
  const hasPhoneNumber = profile.phoneNumber !== null;
  return (
    <section className="employee-profile-panel" aria-label="Your details">
      <ProfileHeader profile={profile} />
      <div className="employee-profile-fields">
        <TextField label="Company email" type="email" value={profile.email} readOnly />
        <TextField label="Position" value={profile.position.name} readOnly />
        <TextField
          label="Phone number"
          type="tel"
          value={profile.phoneNumber ?? ''}
          hint={hasPhoneNumber ? undefined : NOT_RECORDED_YET_TEXT}
          readOnly
        />
      </div>
    </section>
  );
}
