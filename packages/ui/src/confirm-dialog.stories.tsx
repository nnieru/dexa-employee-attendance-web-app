import { useState, type ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button.js';
import { ConfirmDialog } from './confirm-dialog.js';

const SIMULATED_CONFIRM_MS = 1500;

/** Story args must satisfy the required props; the demo replaces open and the handlers at render time. */
function noop(): void {
  return undefined;
}

type ConfirmDialogDemoProps = Omit<
  ComponentProps<typeof ConfirmDialog>,
  'open' | 'onCancel' | 'onConfirm'
>;

/** Stories simulate the confirmed work with a short busy period, then close the dialog. */
function ConfirmDialogDemo({ isBusy = false, ...dialogProps }: ConfirmDialogDemoProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  function handleConfirm() {
    setIsConfirming(true);
    window.setTimeout(() => {
      setIsConfirming(false);
      setIsOpen(false);
    }, SIMULATED_CONFIRM_MS);
  }

  return (
    <div>
      <Button variant="secondary" onClick={() => setIsOpen(true)}>
        Open confirmation
      </Button>
      <ConfirmDialog
        {...dialogProps}
        isBusy={isBusy || isConfirming}
        open={isOpen}
        onCancel={() => setIsOpen(false)}
        onConfirm={handleConfirm}
      />
    </div>
  );
}

const meta = {
  title: 'Shared/ConfirmDialog',
  component: ConfirmDialog,
  args: {
    open: false,
    onCancel: noop,
    onConfirm: noop,
    title: 'Discard unsaved changes?',
    description: 'Your edits to this request will be lost.',
    confirmLabel: 'Discard changes',
    cancelLabel: 'Keep editing',
    isBusy: false,
    tone: 'default',
  },
  parameters: {
    docs: {
      description: {
        component:
          'Confirmation built on Dialog. Initial focus lands on the cancel action. While busy, both actions are disabled and Escape is ignored; toggle isBusy in Controls to see that state. The danger tone marks destructive actions.',
      },
    },
  },
  render: (args) => <ConfirmDialogDemo {...args} />,
} satisfies Meta<typeof ConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Busy: Story = {
  args: { isBusy: true },
};

export const Danger: Story = {
  args: {
    title: 'Delete correction request?',
    description: 'The request and its attachments will be removed permanently.',
    confirmLabel: 'Delete request',
    cancelLabel: 'Keep request',
    tone: 'danger',
  },
};
