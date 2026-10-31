import type { Meta, StoryObj } from '@storybook/react-vite';
import { Avatar } from './avatar.js';

/** A neutral swatch stands in for a photo; stories never show a fabricated portrait. */
const PLACEHOLDER_PHOTO_URL =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' fill='%23F9EEED'/><circle cx='32' cy='32' r='14' fill='%23A52823'/></svg>";

const meta = {
  title: 'Shared/Avatar',
  component: Avatar,
  args: { name: 'Nathaniel Andrian' },
  parameters: {
    docs: {
      description: {
        component:
          'Round employee photo with alt text, or initials from the name when there is no photo or the photo fails to load.',
      },
    },
  },
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Initials: Story = {};

export const WithPhoto: Story = {
  args: { photoUrl: PLACEHOLDER_PHOTO_URL, photoAlt: 'Placeholder employee photo' },
};

export const BrokenPhotoFallsBackToInitials: Story = {
  args: {
    photoUrl: 'https://example.invalid/missing-photo.jpg',
    photoAlt: 'Placeholder employee photo',
  },
};

export const Small: Story = { args: { size: 'small' } };

export const Large: Story = { args: { size: 'large' } };
