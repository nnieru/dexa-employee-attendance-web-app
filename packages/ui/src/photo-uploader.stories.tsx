import type { Meta, StoryObj } from '@storybook/react-vite';
import { PhotoUploader } from './photo-uploader.js';

const FIVE_MEGABYTES = 5 * 1024 * 1024;

/** A neutral swatch stands in for an existing photo; stories never show a fabricated portrait. */
const PLACEHOLDER_PHOTO_URL =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' fill='%23F9EEED'/><circle cx='32' cy='32' r='14' fill='%23A52823'/></svg>";

/** Story args must satisfy the required props; the story does not upload the chosen file. */
function noop(): void {
  return undefined;
}

const meta = {
  title: 'Shared/PhotoUploader',
  component: PhotoUploader,
  args: { label: 'Choose photo', maxBytes: FIVE_MEGABYTES, onSelect: noop },
  parameters: {
    docs: {
      description: {
        component:
          'Photo picker for JPG or PNG files. It checks the type, size, and first bytes before calling onSelect, shows a preview, and reports errors next to the control. The server validates the image content again.',
      },
    },
  },
} satisfies Meta<typeof PhotoUploader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithCurrentPhoto: Story = {
  args: { currentPhotoUrl: PLACEHOLDER_PHOTO_URL },
};

export const ServerError: Story = {
  args: { error: 'The photo could not be saved. Try again.' },
};

export const Disabled: Story = {
  args: { isDisabled: true, currentPhotoUrl: PLACEHOLDER_PHOTO_URL },
};
