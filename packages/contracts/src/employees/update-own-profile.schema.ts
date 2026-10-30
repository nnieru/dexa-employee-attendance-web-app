import { z } from 'zod';

// Matches employees_phone_number_ck (DATABASE §4.2): an optional leading plus, then 8 to 15 digits. The
// database check repeats this rule, so a value that passes here is always storable.
export const PHONE_NUMBER_PATTERN = /^\+?[0-9]{8,15}$/;

// Outer whitespace is trimmed before the pattern runs, and leading zeros are kept (DATABASE §4.2).
export const phoneNumberSchema = z.string().trim().regex(PHONE_NUMBER_PATTERN, {
  error: 'must be an optional leading + followed by 8 to 15 digits',
});

// Strict, so name, email, position, status, profile status, and photo can never be written by the
// employee. The phone key is required: null clears the number, and an empty string is refused.
export const updateOwnProfileRequestSchema = z.strictObject({
  phoneNumber: phoneNumberSchema.nullable(),
});

export type UpdateOwnProfileRequest = z.infer<typeof updateOwnProfileRequestSchema>;
