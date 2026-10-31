import type { Meta, StoryObj } from '@storybook/react-vite';
import { Textarea } from './textarea.js';

const meta = {
  title: 'Shared/Textarea',
  component: Textarea,
  args: { label: 'Reason', name: 'reason' },
  parameters: {
    docs: {
      description: {
        component:
          'Multi-line field with the same rules as TextField: persistent label, linked hint and error, minimum three lines, vertical resize only. A required textarea shows a visible "required" word; assistive technology hears it from the native required attribute. No length limit unless maxLength is passed.',
      },
    },
  },
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithHint: Story = {
  args: {
    hint: 'Describe the reason for this request in a few sentences.',
  },
};

export const Required: Story = {
  args: {
    hint: 'Required when rejecting. Optional when approving.',
    required: true,
  },
};

export const ErrorState: Story = {
  args: {
    defaultValue: 'Laptop',
    error: 'Enter a reason to reject this request. The employee will see it.',
    hint: 'Required when rejecting. Optional when approving.',
    required: true,
  },
};

export const ReadOnly: Story = {
  args: {
    defaultValue: 'Laptop would not boot in the morning; worked from the backup machine.',
    label: 'Submitted reason',
    name: 'submittedReason',
    readOnly: true,
  },
};

export const Disabled: Story = {
  args: {
    defaultValue: 'Month-end reporting deadline.',
    disabled: true,
    label: 'Review note',
    name: 'reviewNote',
  },
};
