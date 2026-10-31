import { ProfileStatus, type Role } from '@dexa/contracts';
import type { StatusLabelProps } from '@dexa/ui';

type StatusTone = NonNullable<StatusLabelProps['tone']>;

export type StatusPresentation = {
  label: string;
  tone: StatusTone;
};

// The master code for an employee who can sign in. Other codes (for example INACTIVE) read as neutral (mockup).
const ACTIVE_EMPLOYEE_STATUS_CODE = 'ACTIVE';

const ROLE_LABELS: Record<Role, string> = {
  EMPLOYEE: 'Employee',
  HR: 'HR',
};

export function getEmploymentStatusPresentation(employeeStatus: {
  code: string;
  name: string;
}): StatusPresentation {
  const tone: StatusTone =
    employeeStatus.code === ACTIVE_EMPLOYEE_STATUS_CODE ? 'success' : 'neutral';
  return { label: employeeStatus.name, tone };
}

// The profile is incomplete until the phone number and photo are present (DATABASE §4.1, EMP-02).
export function getProfileStatusPresentation(profileStatus: ProfileStatus): StatusPresentation {
  if (profileStatus === ProfileStatus.COMPLETE) return { label: 'Complete', tone: 'success' };
  return { label: 'Incomplete', tone: 'warning' };
}

export function getRoleLabel(role: Role): string {
  return ROLE_LABELS[role];
}
