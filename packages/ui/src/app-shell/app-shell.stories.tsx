import type { Meta, StoryObj } from '@storybook/react-vite';
import { IconButton } from '../icon-button.js';
import { AppShell } from './app-shell.js';
import type { AppShellNavItem } from './app-shell-navigation.js';

function noop(): void {
  return undefined;
}

const phoneViewport = {
  name: 'Phone portrait 390 x 844',
  styles: { width: '390px', height: '844px' },
  type: 'mobile',
} as const;

const desktopViewport = {
  name: 'Desktop landscape 1280 x 800',
  styles: { width: '1280px', height: '800px' },
  type: 'desktop',
} as const;

const employeeNavItems: ReadonlyArray<AppShellNavItem> = [
  { id: 'attendance', label: 'Attendance', icon: 'clock', href: '#attendance', isActive: true },
  { id: 'history', label: 'History', icon: 'history', href: '#history', isActive: false },
  { id: 'requests', label: 'Requests', icon: 'file', href: '#requests', isActive: false },
  { id: 'profile', label: 'Profile', icon: 'user', href: '#profile', isActive: false },
];

const hrNavItems: ReadonlyArray<AppShellNavItem> = [
  { id: 'employees', label: 'Employees', icon: 'users', href: '#employees', isActive: false },
  { id: 'attendance', label: 'Attendance', icon: 'clock', href: '#attendance', isActive: false },
  {
    id: 'approvals',
    label: 'Approvals',
    icon: 'review',
    href: '#approvals',
    isActive: true,
    count: { value: 3, unit: 'pending' },
  },
  { id: 'schedule', label: 'Schedule', icon: 'calendar', href: '#schedule', isActive: false },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: 'bell',
    href: '#notifications',
    isActive: false,
    count: { value: 3, unit: 'unread' },
  },
];

const meta = {
  title: 'Shared/App shell',
  component: AppShell,
  args: {
    brand: 'Attendance',
    navItems: employeeNavItems,
    onLogout: noop,
    children: (
      <>
        <h1>Attendance</h1>
        <p>Page content supplied by the consuming application.</p>
      </>
    ),
  },
  parameters: {
    layout: 'fullscreen',
    viewport: {
      options: { phone: phoneViewport, desktop: desktopViewport },
    },
    docs: {
      description: {
        component:
          'Header, navigation, and main region. Below 1024px, or in portrait, navigation is a labeled bottom bar. From 1024px in landscape it is a side rail with Logout at the bottom. Pass navigation items and a logout callback; the shell does not call APIs or read the session.',
      },
    },
  },
} satisfies Meta<typeof AppShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EmployeeOnMobile: Story = {
  parameters: { viewport: { defaultViewport: 'phone' } },
};

export const EmployeeOnDesktop: Story = {
  parameters: { viewport: { defaultViewport: 'desktop' } },
};

export const HrOnMobile: Story = {
  args: {
    brand: 'HR Portal',
    navItems: hrNavItems,
    children: (
      <>
        <h1>Approvals</h1>
        <p>Page content supplied by the consuming application.</p>
      </>
    ),
  },
  parameters: { viewport: { defaultViewport: 'phone' } },
};

export const HrOnDesktop: Story = {
  args: {
    brand: 'HR Portal',
    navItems: hrNavItems,
    headerActions: <IconButton aria-label="Notifications, 3 unread" iconName="bell" />,
    children: (
      <>
        <h1>Approvals</h1>
        <p>Page content supplied by the consuming application.</p>
      </>
    ),
  },
  parameters: { viewport: { defaultViewport: 'desktop' } },
};
