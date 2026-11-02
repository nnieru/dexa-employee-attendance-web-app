import { z } from 'zod';
import { profileStatusSchema } from './profile-status.js';

// The employee's own profile. Name, email, and position are read-only for the employee.
// Not strict: this is a response, and a reader ignores fields that a later version adds. The schema names
// only the fields it returns, so a password, hash, or stored photo key can never be part of it.
export const ownProfileSchema = z.object({
  accountId: z.uuid(),
  name: z.string().min(1),
  email: z.email(),
  position: z.object({
    code: z.string().min(1),
    name: z.string().min(1),
  }),
  phoneNumber: z.string().nullable(),
  // A protected relative URL, or null when the employee has no photo.
  photoUrl: z.string().min(1).nullable(),
  profileStatus: profileStatusSchema,
});

export type OwnProfile = z.infer<typeof ownProfileSchema>;
