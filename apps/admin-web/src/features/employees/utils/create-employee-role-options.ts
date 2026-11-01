import { Role } from '@dexa/contracts';

type RoleOption = { value: Role; label: string };

// Order follows the form: the default role comes first.
export const ROLE_OPTIONS: ReadonlyArray<RoleOption> = [
  { value: Role.EMPLOYEE, label: 'Employee' },
  { value: Role.HR, label: 'HR' },
];
