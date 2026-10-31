import { useState, type ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button.js';
import { Dialog } from './dialog.js';

type DialogDemoProps = Omit<ComponentProps<typeof Dialog>, 'open' | 'onClose'>;

/** Story args must satisfy the required props; the demo replaces open and onClose at render time. */
function noop(): void {
  return undefined;
}

function DialogDemo(dialogProps: DialogDemoProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <Button variant="secondary" onClick={() => setIsOpen(true)}>
        Open dialog
      </Button>
      <Dialog {...dialogProps} open={isOpen} onClose={() => setIsOpen(false)} />
    </div>
  );
}

const meta = {
  title: 'Shared/Dialog',
  component: Dialog,
  args: {
    open: false,
    onClose: noop,
    title: 'Edit contact details',
    children: <p>Update the phone number HR uses for follow-up.</p>,
  },
  parameters: {
    docs: {
      description: {
        component:
          'Modal dialog built on the native dialog element. Focus moves inside on open, Tab cycles within it, Escape reports through onClose, and focus returns to the trigger when it closes. Use the trigger button to open and close it.',
      },
    },
  },
  render: (args) => <DialogDemo {...args} />,
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithDescription: Story = {
  args: {
    title: 'Discard unsaved changes?',
    description: 'Changes you made to this contact will not be kept.',
  },
};

export const WithFooter: Story = {
  args: {
    title: 'Send attendance summary',
    description: 'The summary is sent to your HR contact.',
    footer: (
      <>
        <Button variant="secondary">Not now</Button>
        <Button>Send summary</Button>
      </>
    ),
  },
};
