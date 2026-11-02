import { z } from 'zod';

// Mirrors the employees_profile_status_ck values. The server derives the value; clients only read it.
export const ProfileStatus = {
  INCOMPLETE: 'INCOMPLETE',
  COMPLETE: 'COMPLETE',
} as const;

export type ProfileStatus = (typeof ProfileStatus)[keyof typeof ProfileStatus];

export const profileStatusSchema = z.enum(ProfileStatus);
