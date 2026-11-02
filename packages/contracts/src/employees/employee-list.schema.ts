import { z } from 'zod';
import { roleSchema } from '../auth/role.js';
import { createPageSchema, paginationQuerySchema } from '../pagination/pagination.schema.js';
import { employeeDetailOptionSchema } from './employee-detail.schema.js';
import { profileStatusSchema } from './profile-status.js';

// Matches accounts.company_email, varchar(254). A search term can name at most one address.
const SEARCH_TERM_MAX_LENGTH = 254;

// A blank term is the same as no term, so the list shows every employee. The trimmed value is what gets searched.
const optionalSearchTermSchema = z
  .string()
  .trim()
  .max(SEARCH_TERM_MAX_LENGTH)
  .transform((term) => (term.length === 0 ? undefined : term))
  .optional();

// Strict, so an unknown query parameter is refused rather than ignored (the pagination rules apply too).
export const employeeListQuerySchema = paginationQuerySchema.extend({
  q: optionalSearchTermSchema,
});

export type EmployeeListQuery = z.infer<typeof employeeListQuerySchema>;

// One row of the HR employee list. Email and role come from Auth, so both are null when Auth did not
// answer for the account. The schema names only the fields it returns, so no photo key can be part of it.
// Not strict: a reader ignores fields that a later version adds.
export const employeeListItemSchema = z.object({
  accountId: z.uuid(),
  name: z.string().min(1),
  email: z.email().nullable(),
  role: roleSchema.nullable(),
  position: employeeDetailOptionSchema,
  employeeStatus: employeeDetailOptionSchema,
  phoneNumber: z.string().nullable(),
  profileStatus: profileStatusSchema,
  // A protected relative URL for HR, or null when the employee has no photo.
  photoUrl: z.string().min(1).nullable(),
});

export type EmployeeListItem = z.infer<typeof employeeListItemSchema>;

export const employeeListPageSchema = createPageSchema(employeeListItemSchema);

export type EmployeeListPage = z.infer<typeof employeeListPageSchema>;
