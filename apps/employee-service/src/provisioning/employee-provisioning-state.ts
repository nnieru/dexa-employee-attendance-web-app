import { z } from 'zod';

// The stored phases of one provisioning operation. A retry resumes from the stored phase.
export const EmployeeProvisioningState = {
  RESERVED: 'RESERVED',
  PROFILE_SAVED: 'PROFILE_SAVED',
  ACTIVE: 'ACTIVE',
} as const;

export type EmployeeProvisioningState =
  (typeof EmployeeProvisioningState)[keyof typeof EmployeeProvisioningState];

// Matches employee_provisioning_operations_state_ck, so a stored value outside these phases fails loudly.
export const employeeProvisioningStateSchema = z.enum(EmployeeProvisioningState);
