import { readCheckViolationConstraint } from '@dexa/common';
import type { MasterAssignmentField } from './master-assignment.reader.interface.js';

// Constraint names from the employees table (migration 0001). The trigger names the one it rejected.
const MASTER_CONSTRAINT_FIELDS: Readonly<Record<string, MasterAssignmentField>> = {
  employees_position_id_active_ck: 'positionId',
  employees_employee_status_id_active_ck: 'employeeStatusId',
};

/**
 * Names the field whose master option the database refused to assign, so a write that raced with a deactivation
 * answers 400 instead of 500. The trigger rejects only a changed reference, so this is undefined for other errors.
 */
export function findMasterAssignmentViolation(error: unknown): MasterAssignmentField | undefined {
  const constraint = readCheckViolationConstraint(error);
  return constraint === undefined ? undefined : MASTER_CONSTRAINT_FIELDS[constraint];
}
