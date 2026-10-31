import type { Meta, StoryObj } from '@storybook/react-vite';
import { TextField } from './text-field.js';

const meta = {
  title: 'Shared/TextField',
  component: TextField,
  args: { label: 'Phone number', name: 'phone' },
  parameters: {
    docs: {
      description: {
        component:
          'Single-line field with a persistent label. Errors and hints are linked to the input with aria-describedby. Placeholders never replace the label.',
      },
    },
  },
} satisfies Meta<typeof TextField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithHint: Story = {
  args: {
    hint: 'Include the country code, for example +62.',
  },
};

export const ErrorState: Story = {
  args: {
    defaultValue: '0812',
    error: 'Enter a phone number with at least 10 digits.',
    hint: 'Include the country code, for example +62.',
  },
};

export const ReadOnly: Story = {
  args: {
    defaultValue: 'employee@example.com',
    label: 'Company email',
    name: 'email',
    readOnly: true,
  },
};
