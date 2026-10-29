import type { Meta, StoryObj } from '@storybook/react-vite';
import { PageShell } from './page-shell.js';

const meta = {
  title: 'Shared/Page shell',
  component: PageShell,
  args: {
    title: 'Shared content',
    description: 'Example layout for shared application content.',
    children: <p>Content supplied by the consuming application.</p>,
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Responsive content and form widths follow the local Dexa design tokens.',
      },
    },
  },
} satisfies Meta<typeof PageShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ContentLayout: Story = {};

export const FormLayout: Story = {
  args: {
    layout: 'form',
    title: 'Masuk',
    description: 'Form layout demonstration.',
    children: <p>Form content supplied by the consuming application.</p>,
  },
};
