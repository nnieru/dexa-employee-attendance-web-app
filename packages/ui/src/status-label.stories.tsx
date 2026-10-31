import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatusLabel } from './status-label.js';

const meta = {
  title: 'Shared/StatusLabel',
  component: StatusLabel,
  args: { children: 'Active', tone: 'neutral' },
  parameters: {
    docs: {
      description: {
        component:
          'Compact, static status text. The visible text always carries the meaning; the tone only adds color. Status labels are not live regions and are not interactive.',
      },
    },
  },
} satisfies Meta<typeof StatusLabel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Neutral: Story = { args: { tone: 'neutral', children: 'Not recorded yet' } };

export const Success: Story = { args: { tone: 'success', children: 'On time' } };

export const Warning: Story = { args: { tone: 'warning', children: 'Late check-in' } };

export const ErrorState: Story = { args: { tone: 'error', children: 'Rejected' } };

export const Info: Story = { args: { tone: 'info', children: 'Sick leave' } };

export const AttendanceExamples: Story = {
  render: () => (
    <ul className="flex flex-wrap gap-2">
      <li>
        <StatusLabel tone="success">On time</StatusLabel>
      </li>
      <li>
        <StatusLabel tone="warning">Late check-in</StatusLabel>
      </li>
      <li>
        <StatusLabel tone="neutral">Pending check-out</StatusLabel>
      </li>
      <li>
        <StatusLabel tone="success">Active</StatusLabel>
      </li>
      <li>
        <StatusLabel tone="neutral">Inactive</StatusLabel>
      </li>
      <li>
        <StatusLabel tone="warning">Awaiting approval</StatusLabel>
      </li>
      <li>
        <StatusLabel tone="success">Approved</StatusLabel>
      </li>
      <li>
        <StatusLabel tone="error">Rejected</StatusLabel>
      </li>
      <li>
        <StatusLabel tone="info">Leave</StatusLabel>
      </li>
    </ul>
  ),
};
