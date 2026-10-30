import { z } from 'zod';
import { passwordSchema } from '../auth/password.schema.js';
import { EMPLOYEE_NAME_MAX_LENGTH } from './create-employee.schema.js';
import { phoneNumberSchema } from './update-own-profile.schema.js';

// Strict, so a caller cannot send an account ID, a profile status, an email, or a role: the server decides those.
// Every field is optional. An absent field keeps the stored value, and a body that names no field is refused, so
// each request states what HR changes. The password is not part of the profile; it goes only to Auth.
export const updateEmployeeRequestSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(EMPLOYEE_NAME_MAX_LENGTH).optional(),
    positionId: z.uuid().optional(),
    phoneNumber: phoneNumberSchema.nullable().optional(),
    employeeStatusId: z.uuid().optional(),
    newPassword: passwordSchema.optional(),
  })
  .refine((request) => Object.values(request).some((value) => value !== undefined), {
    error: 'must include at least one field to update',
  });

export type UpdateEmployeeRequest = z.infer<typeof updateEmployeeRequestSchema>;
