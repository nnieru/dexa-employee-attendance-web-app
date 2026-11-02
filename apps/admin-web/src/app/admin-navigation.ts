import type { IconName } from '@dexa/ui';

export type AdminNavigationPath =
  '/employees' | '/attendance' | '/approvals' | '/schedule' | '/notifications';

export type AdminNavigationEntry = {
  id: string;
  label: string;
  icon: IconName;
  to: AdminNavigationPath;
};

// order: Employees, Attendance, Approvals, Schedule, Notifications, then Logout (rendered by the shell).
export const ADMIN_NAVIGATION: ReadonlyArray<AdminNavigationEntry> = [
  { id: 'employees', label: 'Employees', icon: 'users', to: '/employees' },
  { id: 'attendance', label: 'Attendance', icon: 'clock', to: '/attendance' },
  { id: 'approvals', label: 'Approvals', icon: 'review', to: '/approvals' },
  { id: 'schedule', label: 'Schedule', icon: 'calendar', to: '/schedule' },
  { id: 'notifications', label: 'Notifications', icon: 'bell', to: '/notifications' },
];
