import type { IconName } from '@dexa/ui';

export type EmployeeNavigationPath = '/attendance' | '/history' | '/requests' | '/profile';

export type EmployeeNavigationEntry = {
  id: string;
  label: string;
  icon: IconName;
  to: EmployeeNavigationPath;
};

// DESIGN §6 order: Attendance, History, Requests, Profile, then Logout (rendered by the shell).
export const EMPLOYEE_NAVIGATION: ReadonlyArray<EmployeeNavigationEntry> = [
  { id: 'attendance', label: 'Attendance', icon: 'clock', to: '/attendance' },
  { id: 'history', label: 'History', icon: 'history', to: '/history' },
  { id: 'requests', label: 'Requests', icon: 'file', to: '/requests' },
  { id: 'profile', label: 'Profile', icon: 'user', to: '/profile' },
];
