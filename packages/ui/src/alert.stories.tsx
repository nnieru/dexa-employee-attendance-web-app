import type { Meta, StoryObj } from '@storybook/react-vite';
import { Alert } from './alert.js';
import { Button } from './button.js';

/** Story args must satisfy the optional handler; the story only shows the close control. */
function noop(): void {
  return undefined;
}

const retryAction = (
  <Button variant="secondary" type="button">
    Try again
  </Button>
);

const meta = {
  title: 'Shared/Alert',
  component: Alert,
  args: { children: 'Changes saved.' },
  parameters: {
    docs: {
      description: {
        component:
          'Full-width feedback with a short message and an optional action. Error alerts use role="alert"; other variants use role="status".',
      },
    },
  },
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Neutral: Story = { args: { variant: 'neutral' } };

export const Success: Story = {
  args: { variant: 'success', children: 'Changes saved.' },
};

export const Warning: Story = {
  args: { variant: 'warning', children: 'Your request is awaiting approval.' },
};

export const ErrorState: Story = {
  args: {
    variant: 'error',
    children: 'Attendance was not recorded. Check your connection and try again.',
  },
};

export const Dismissible: Story = {
  args: { variant: 'success', children: 'Changes saved.', onDismiss: noop },
};

export const NeutralWithAction: Story = {
  args: { variant: 'neutral', action: retryAction },
};

export const SuccessWithAction: Story = {
  args: { variant: 'success', children: 'Changes saved.', action: retryAction },
};

export const WarningWithAction: Story = {
  args: {
    variant: 'warning',
    children: 'Your request is awaiting approval.',
    action: retryAction,
  },
};

export const ErrorWithAction: Story = {
  args: {
    variant: 'error',
    children: 'Attendance was not recorded. Check your connection and try again.',
    action: retryAction,
  },
};
