import { z } from 'zod';
import { createPageSchema } from '../pagination/pagination.schema.js';
import { roleSchema } from './role.js';

// Matches accounts.company_email, varchar(254).
const EMAIL_MAX_LENGTH = 254;

// Bounds one batched lookup, so a caller that holds more IDs splits the request instead of asking for one large query.
export const ACCOUNT_LOOKUP_MAX_IDS = 100;
// The email search returns at most this many IDs, so the employee list resolves a bounded set.
export const ACCOUNT_SEARCH_MAX_IDS = 100;

export const accountIdSchema = z.uuid();

// Strict, so a caller cannot send fields that the lookup does not read.
export const accountLookupRequestSchema = z.strictObject({
  ids: z.array(accountIdSchema).min(1).max(ACCOUNT_LOOKUP_MAX_IDS),
});

export type AccountLookupRequest = z.infer<typeof accountLookupRequestSchema>;

// Not strict: a reader that parses a response ignores fields that a later version adds.
export const accountLookupItemSchema = z.object({
  id: accountIdSchema,
  email: z.email(),
  role: roleSchema,
});

export type AccountLookupItem = z.infer<typeof accountLookupItemSchema>;

export const accountLookupResponseSchema = z.array(accountLookupItemSchema);

export const accountStatusSchema = z.object({ isActive: z.boolean() });

export type AccountStatus = z.infer<typeof accountStatusSchema>;

// The search term and the exact-match email share one query shape. Strict, so an unknown parameter is refused.
export const accountEmailQuerySchema = z.strictObject({
  email: z
    .string()
    .trim()
    .min(1, { error: 'must not be empty' })
    .max(EMAIL_MAX_LENGTH, { error: `must be at most ${EMAIL_MAX_LENGTH} characters` }),
});

export type AccountEmailQuery = z.infer<typeof accountEmailQuerySchema>;

export const accountSearchResponseSchema = z.object({
  ids: z.array(accountIdSchema).max(ACCOUNT_SEARCH_MAX_IDS),
});

export type AccountSearchResponse = z.infer<typeof accountSearchResponseSchema>;

export const accountReferenceSchema = z.object({
  id: accountIdSchema,
  role: roleSchema,
});

export type AccountReference = z.infer<typeof accountReferenceSchema>;

export const accountIdPageSchema = createPageSchema(accountIdSchema);

export type AccountIdPage = z.infer<typeof accountIdPageSchema>;
