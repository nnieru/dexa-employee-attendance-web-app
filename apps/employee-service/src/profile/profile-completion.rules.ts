import { ProfileStatus } from '@dexa/contracts';

export type ProfileCompletionFields = {
  readonly name: string;
  readonly positionId: string;
  readonly phoneNumber: string | null;
  readonly photoKey: string | null;
};

/**
 * DATABASE §4.1: a profile is complete when it has a name and a position and a non-empty phone number and
 * photo reference. An inactive position still counts as present. The employees_profile_status_completion_ck
 * check enforces the phone and photo part of the same rule, so a status this returns is always storable.
 */
export function calculateProfileStatus(fields: ProfileCompletionFields): ProfileStatus {
  const isComplete = [fields.name, fields.positionId, fields.phoneNumber, fields.photoKey].every(
    isFilled,
  );
  return isComplete ? ProfileStatus.COMPLETE : ProfileStatus.INCOMPLETE;
}

// Whitespace-only counts as empty, matching the btrim() in the database check.
function isFilled(value: string | null): boolean {
  return value !== null && value.trim().length > 0;
}
