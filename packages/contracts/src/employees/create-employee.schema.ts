import { z } from 'zod';
import { companyEmailSchema } from '../auth/company-email.schema.js';
import { passwordSchema } from '../auth/password.schema.js';
import { roleSchema } from '../auth/role.js';
import { phoneNumberSchema } from './update-own-profile.schema.js';

// Bounds from DATABASE §4 (employees.name is varchar(150)).
export const EMPLOYEE_NAME_MAX_LENGTH = 150;

// Strict, so a caller cannot send an account ID, a profile status, or any other field the server decides.
// The email is lowercased after it is validated, as provisioning compares it (DATABASE §3). The phone key is
// required: null means no phone number, and the server records it as stored. The password goes only to Auth.
export const createEmployeeRequestSchema = z.strictObject({
  operationId: z.uuid(),
  name: z.string().trim().min(1).max(EMPLOYEE_NAME_MAX_LENGTH),
  email: companyEmailSchema.transform((email) => email.toLowerCase()),
  positionId: z.uuid(),
  employeeStatusId: z.uuid(),
  phoneNumber: phoneNumberSchema.nullable(),
  role: roleSchema,
  initialPassword: passwordSchema,
});

export type CreateEmployeeRequest = z.infer<typeof createEmployeeRequestSchema>;
