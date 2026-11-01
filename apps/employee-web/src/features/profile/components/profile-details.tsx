import type { OwnProfile } from '@dexa/contracts';
import { TextField } from '@dexa/ui';
import { PasswordChangeForm } from './password-change-form.js';
import { PhoneNumberForm } from './phone-number-form.js';
import { PhotoUploadForm } from './photo-upload-form.js';
import { ProfileHeader } from './profile-header.js';

type ProfileDetailsProps = {
  profile: OwnProfile;
};

// Name, email and position are read-only for the employee (PRO-3). Phone, photo and password are what the
// employee changes (PRO-2), each with its own save and its own success message.
export function ProfileDetails({ profile }: ProfileDetailsProps) {
  return (
    <section className="employee-profile-panel" aria-label="Your details">
      <ProfileHeader profile={profile} />
      <div className="employee-profile-fields">
        <TextField label="Company email" type="email" value={profile.email} readOnly />
        <TextField label="Position" value={profile.position.name} readOnly />
      </div>
      <PhoneNumberForm phoneNumber={profile.phoneNumber} />
      <PhotoUploadForm />
      <PasswordChangeForm />
    </section>
  );
}
