import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../button.js';
import type { ShowToastInput } from './toast-context.js';
import { ToastProvider } from './toast-provider.js';
import { useToast } from './use-toast.js';

/** Each button press shows one toast with the story's arguments. */
function ToastDemo(toastInput: ShowToastInput) {
  const { showToast } = useToast();

  return (
    <Button variant="secondary" onClick={() => showToast(toastInput)}>
      Show toast
    </Button>
  );
}

const meta = {
  title: 'Shared/Toast',
  component: ToastDemo,
  args: { message: 'Changes saved.', variant: 'info' },
  decorators: [
    (Story) => (
      <ToastProvider>
        <Story />
      </ToastProvider>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'Brief confirmations shown through useToast inside ToastProvider. Toasts are announced politely by one live region that stays in the page. Info and success toasts close on their own after a few seconds unless the pointer or focus is on them; warning and error toasts stay until closed. Every toast has a Close button, and an optional link goes to the related details.',
      },
    },
  },
} satisfies Meta<typeof ToastDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = { args: { message: 'Profile update received.', variant: 'info' } };

export const Success: Story = { args: { message: 'Changes saved.', variant: 'success' } };

export const Warning: Story = {
  args: { message: 'Your request is awaiting approval.', variant: 'warning' },
};

export const ErrorState: Story = {
  args: {
    message: 'Attendance was not recorded. Check your connection and try again.',
    variant: 'error',
  },
};

export const WithLink: Story = {
  args: {
    message: 'Priya Sharma changed her phone number.',
    variant: 'info',
    link: { label: 'View employee', href: '/employees/priya-sharma' },
  },
};
