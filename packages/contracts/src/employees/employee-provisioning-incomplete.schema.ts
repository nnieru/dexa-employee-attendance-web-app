import { z } from 'zod';

// The phases that a provisioning operation can stop in before it is ACTIVE. ACTIVE is the
// only phase that is not partial, so it never appears here.
export const EmployeeProvisioningSavedPhase = {
  RESERVED: 'RESERVED',
  PROFILE_SAVED: 'PROFILE_SAVED',
} as const;

export type EmployeeProvisioningSavedPhase =
  (typeof EmployeeProvisioningSavedPhase)[keyof typeof EmployeeProvisioningSavedPhase];

// The details of an EMPLOYEE_PROVISIONING_INCOMPLETE answer. accountId is present once Auth has answered for the
// operation, so a RESERVED operation whose Auth call was lost has no accountId yet.
export const employeeProvisioningIncompleteDetailsSchema = z.object({
  operationId: z.uuid(),
  savedPhase: z.enum(EmployeeProvisioningSavedPhase),
  accountId: z.uuid().optional(),
});

export type EmployeeProvisioningIncompleteDetails = z.infer<
  typeof employeeProvisioningIncompleteDetailsSchema
>;
