import type { Preview } from '@storybook/react-vite';
import '../src/styles.css';

const preview: Preview = {
  tags: ['autodocs'],
  parameters: { controls: { expanded: true } },
};

export default preview;
