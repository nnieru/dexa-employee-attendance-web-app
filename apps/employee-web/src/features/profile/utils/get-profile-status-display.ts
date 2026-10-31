import type { ProfileStatus } from '@dexa/contracts';
import type { StatusLabelProps } from '@dexa/ui';

export type ProfileStatusDisplay = {
  text: string;
  tone: NonNullable<StatusLabelProps['tone']>;
};

// Profile completion is separate from employment status and never disables attendance (DESIGN §8). The text
// carries the meaning; the tone only adds colour (DESIGN §6 functional states).
const PROFILE_STATUS_DISPLAY: Record<ProfileStatus, ProfileStatusDisplay> = {
  COMPLETE: { text: 'Profile complete', tone: 'success' },
  INCOMPLETE: { text: 'Profile incomplete', tone: 'warning' },
};

export function getProfileStatusDisplay(profileStatus: ProfileStatus): ProfileStatusDisplay {
  return PROFILE_STATUS_DISPLAY[profileStatus];
}
