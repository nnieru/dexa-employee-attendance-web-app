import type { Meta, StoryObj } from '@storybook/react-vite';
import { Icon, type IconName } from './icon.js';

const ICON_NAMES: readonly IconName[] = [
  'bell',
  'calendar',
  'check',
  'chevron-down',
  'chevron-left',
  'chevron-right',
  'clock',
  'file',
  'history',
  'info',
  'logout',
  'pencil',
  'plus',
  'review',
  'search',
  'upload',
  'user',
  'users',
  'x',
];

function IconGallery({ size }: { size: 'default' | 'small' }) {
  return (
    <ul className="flex flex-wrap gap-4">
      {ICON_NAMES.map((name) => (
        <li key={name} className="flex flex-col items-center gap-2 text-xs">
          <Icon name={name} size={size} />
          <span>{name}</span>
        </li>
      ))}
    </ul>
  );
}

const meta = {
  title: 'Shared/Icon',
  component: Icon,
  args: { name: 'check' },
  parameters: {
    docs: {
      description: {
        component:
          'Inline icons from the UI mockup, Lucide style, drawn with currentColor. Icons are decorative and always hidden from assistive technology; name the control or the adjacent text instead. Sizes: 20px by default, 16px when small.',
      },
    },
  },
  render: (args) => <IconGallery size={args.size ?? 'default'} />,
} satisfies Meta<typeof Icon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { size: 'default' } };

export const Small: Story = { args: { size: 'small' } };
