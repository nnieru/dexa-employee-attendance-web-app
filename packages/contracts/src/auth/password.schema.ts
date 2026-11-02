import { z } from 'zod';

// Shared by the web forms and the server: 8 to 128 characters.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

const LETTER_PATTERN = /\p{L}/u;
const DIGIT_PATTERN = /\p{Nd}/u;

// Spreading a string yields code points, so an emoji counts once, as people count characters.
// String.length counts UTF-16 units, where an emoji counts twice.
function countCodePoints(password: string): number {
  return [...password].length;
}

// Each rule has its own message so that the form can name the rule that failed. The password is
// checked exactly as typed, with no trimming or normalization, because the hash is computed from
// these same characters.
export const passwordSchema = z
  .string()
  .refine((password) => countCodePoints(password) >= PASSWORD_MIN_LENGTH, {
    message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
  })
  .refine((password) => countCodePoints(password) <= PASSWORD_MAX_LENGTH, {
    message: `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`,
  })
  .refine((password) => LETTER_PATTERN.test(password), {
    message: 'Password must include a letter.',
  })
  .refine((password) => DIGIT_PATTERN.test(password), {
    message: 'Password must include a number.',
  });
