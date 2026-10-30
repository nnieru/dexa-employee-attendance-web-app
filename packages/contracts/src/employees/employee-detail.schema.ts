import { z } from 'zod';
import { roleSchema } from '../auth/role.js';
import { profileStatusSchema } from './profile-status.js';

// One master option as an employee response shows it. Unlike a catalog row, it carries no active flag.
export const employeeDetailOptionSchema = z.object({
  id: z.uuid(),
  code: z.string().min(1),
  name: z.string().min(1),
});

// The HR view of one employee (ADM-1). Not strict: a reader ignores fields that a later version adds. The schema
// names only the fields it returns, so no password, hash, or stored photo key can be part of it.
export const employeeDetailSchema = z.object({
  accountId: z.uuid(),
  name: z.string().min(1),
  email: z.email(),
  role: roleSchema,
  position: employeeDetailOptionSchema,
  employeeStatus: employeeDetailOptionSchema,
  phoneNumber: z.string().nullable(),
  profileStatus: profileStatusSchema,
});

export type EmployeeDetail = z.infer<typeof employeeDetailSchema>;
