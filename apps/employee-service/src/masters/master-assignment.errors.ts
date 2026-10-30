import { ValidationError } from '@dexa/common';
import { ErrorCode } from '@dexa/contracts';
import type { MasterAssignmentField } from './master-assignment.reader.interface.js';

// Messages name the field only, in the same form as the request validation errors.
const MASTER_NOT_ASSIGNABLE_MESSAGES: Readonly<Record<MasterAssignmentField, string>> = {
  positionId: 'positionId: must reference an existing active position.',
  employeeStatusId: 'employeeStatusId: must reference an existing active employee status.',
};

export function masterNotAssignableError(field: MasterAssignmentField): ValidationError {
  return new ValidationError(ErrorCode.VALIDATION_FAILED, MASTER_NOT_ASSIGNABLE_MESSAGES[field]);
}
