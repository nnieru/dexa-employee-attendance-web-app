import type { EmployeeDetail } from '@dexa/contracts';
import type { UpdateEmployeeFormValues } from '../types/update-employee-form.schema.js';

/** The form starts from the stored employee. The password is never loaded, so it starts empty (keep current). */
export function toUpdateEmployeeFormValues(employee: EmployeeDetail): UpdateEmployeeFormValues {
  return {
    name: employee.name,
    positionId: employee.position.id,
    employeeStatusId: employee.employeeStatus.id,
    phoneNumber: employee.phoneNumber ?? '',
    newPassword: '',
  };
}
