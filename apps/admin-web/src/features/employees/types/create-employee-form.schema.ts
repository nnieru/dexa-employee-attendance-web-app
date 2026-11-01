import {
  createEmployeeRequestSchema,
  passwordSchema,
  phoneNumberSchema,
  roleSchema,
} from '@dexa/contracts';
import { z } from 'zod';

const NAME_REQUIRED_MESSAGE = 'Enter the employee name.';
const POSITION_REQUIRED_MESSAGE = 'Select a position.';
const EMPLOYEE_STATUS_REQUIRED_MESSAGE = 'Select an employment status.';
const PHONE_NUMBER_FORMAT_MESSAGE =
  'Use an optional leading + followed by 8 to 15 digits, or leave this empty.';

// The contract's employee name bound (DATABASE §4, employees.name varchar(150)). The server checks it again.
const NAME_MAX_LENGTH = 150;
const NAME_TOO_LONG_MESSAGE = `Use ${NAME_MAX_LENGTH} characters or fewer.`;

// Phone is optional in the form. An empty field becomes a null phone number when the request is built.
function isOptionalPhoneNumber(value: string): boolean {
  return value.length === 0 || phoneNumberSchema.safeParse(value).success;
}

/**
 * The create form's rules. Email, role, and password reuse the contract schemas, so the form names the same rules the
 * server enforces. Every value is a string here, so the form's input and output types match. The contract gets the
 * final check when the request is built (toCreateEmployeeRequest).
 */
export const createEmployeeFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: NAME_REQUIRED_MESSAGE })
    .max(NAME_MAX_LENGTH, { error: NAME_TOO_LONG_MESSAGE }),
  email: createEmployeeRequestSchema.shape.email,
  positionId: z.uuid({ error: POSITION_REQUIRED_MESSAGE }),
  employeeStatusId: z.uuid({ error: EMPLOYEE_STATUS_REQUIRED_MESSAGE }),
  phoneNumber: z
    .string()
    .trim()
    .refine(isOptionalPhoneNumber, { error: PHONE_NUMBER_FORMAT_MESSAGE }),
  role: roleSchema,
  initialPassword: passwordSchema,
});

export type CreateEmployeeFormValues = z.infer<typeof createEmployeeFormSchema>;
